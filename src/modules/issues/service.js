const {
  Issue, IssueMessage, Parent, StudentParent, Student, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const notificationsService = require('../notifications/service');

const ISSUE_MANAGER_ROLES = ['SCHOOL_ADMIN', 'HEAD_TEACHER'];

async function getParentForUser(schoolId, userId) {
  const parent = await tenantScoped(Parent, schoolId).findOne({ where: { userId } });
  if (!parent) throw new ApiError(403, 'No parent record is linked to this account.');
  return parent;
}

async function assertParentOwnsStudent(schoolId, parentId, studentId) {
  const link = await tenantScoped(StudentParent, schoolId).findOne({ where: { parentId, studentId } });
  if (!link) throw new ApiError(403, 'You are not linked to this student.');
}

// separate: true — without it, Sequelize can't apply `order` to a hasMany
// include (it only affects the top-level query), and a straight JOIN here
// would multiply each Issue row per message.
const messageInclude = {
  model: IssueMessage,
  as: 'messages',
  separate: true,
  include: [{ model: User, as: 'author', attributes: ['id', 'fullName'] }],
  order: [['createdAt', 'ASC']],
};

async function createIssue(schoolId, userId, { studentId, subject, body }) {
  const parent = await getParentForUser(schoolId, userId);
  if (studentId) await assertParentOwnsStudent(schoolId, parent.id, studentId);

  const now = new Date();
  const issue = await tenantScoped(Issue, schoolId).create({
    parentId: parent.id, studentId: studentId || null, subject, status: 'OPEN', lastMessageAt: now,
  });
  await tenantScoped(IssueMessage, schoolId).create({
    issueId: issue.id, authorUserId: userId, authorRole: 'PARENT', body,
  });
  await notificationsService.notifyRoles(schoolId, ISSUE_MANAGER_ROLES, {
    type: 'ISSUE_MESSAGE',
    title: `New message from ${parent.fullName}`,
    body: subject,
    linkUrl: `/admin/issues/${issue.id}`,
  });
  return issue;
}

async function listIssuesForParent(schoolId, userId) {
  const parent = await getParentForUser(schoolId, userId);
  const issues = await tenantScoped(Issue, schoolId).findAll({
    where: { parentId: parent.id },
    include: [Student, messageInclude],
    order: [['lastMessageAt', 'DESC']],
  });

  return issues.map((issue) => {
    const messages = issue.messages || [];
    const lastMessage = messages[messages.length - 1];
    const hasUnreadReply = lastMessage
      && lastMessage.authorRole === 'STAFF'
      && (!issue.parentLastReadAt || lastMessage.createdAt > issue.parentLastReadAt);
    return {
      id: issue.id,
      subject: issue.subject,
      status: issue.status,
      studentName: issue.Student ? issue.Student.fullName : null,
      lastMessageAt: issue.lastMessageAt,
      messageCount: messages.length,
      hasUnreadReply: !!hasUnreadReply,
    };
  });
}

async function getIssueForParent(schoolId, userId, issueId) {
  const parent = await getParentForUser(schoolId, userId);
  const issue = await tenantScoped(Issue, schoolId).findOne({
    where: { id: issueId, parentId: parent.id },
    include: [Student, messageInclude],
  });
  if (!issue) throw new ApiError(404, 'Issue not found');

  await issue.update({ parentLastReadAt: new Date() });
  return issue;
}

async function addParentMessage(schoolId, userId, issueId, body) {
  const parent = await getParentForUser(schoolId, userId);
  const issue = await tenantScoped(Issue, schoolId).findOne({ where: { id: issueId, parentId: parent.id } });
  if (!issue) throw new ApiError(404, 'Issue not found');

  const now = new Date();
  const message = await tenantScoped(IssueMessage, schoolId).create({
    issueId: issue.id, authorUserId: userId, authorRole: 'PARENT', body,
  });
  // A parent following up on an issue the school marked resolved means it
  // isn't actually resolved — reopen it so it surfaces again in the staff
  // queue instead of sitting silently closed.
  await issue.update({ lastMessageAt: now, parentLastReadAt: now, status: 'OPEN' });
  await notificationsService.notifyRoles(schoolId, ISSUE_MANAGER_ROLES, {
    type: 'ISSUE_MESSAGE',
    title: `New message from ${parent.fullName}`,
    body: issue.subject,
    linkUrl: `/admin/issues/${issue.id}`,
  });
  return message;
}

async function listIssuesForStaff(schoolId, { status } = {}) {
  const where = {};
  if (status) where.status = status;
  const issues = await tenantScoped(Issue, schoolId).findAll({
    where,
    include: [Student, { model: Parent, attributes: ['id', 'fullName', 'phone', 'email'] }, messageInclude],
    order: [['lastMessageAt', 'DESC']],
  });

  return issues.map((issue) => {
    const messages = issue.messages || [];
    const lastMessage = messages[messages.length - 1];
    return {
      id: issue.id,
      subject: issue.subject,
      status: issue.status,
      parentName: issue.Parent ? issue.Parent.fullName : null,
      studentName: issue.Student ? issue.Student.fullName : null,
      lastMessageAt: issue.lastMessageAt,
      lastMessageFrom: lastMessage ? lastMessage.authorRole : null,
      messageCount: messages.length,
    };
  });
}

async function getIssueForStaff(schoolId, issueId) {
  const issue = await tenantScoped(Issue, schoolId).findOne({
    where: { id: issueId },
    include: [Student, { model: Parent, attributes: ['id', 'fullName', 'phone', 'email'] }, messageInclude],
  });
  if (!issue) throw new ApiError(404, 'Issue not found');
  return issue;
}

async function addStaffMessage(schoolId, userId, issueId, body) {
  const issue = await tenantScoped(Issue, schoolId).findByPk(issueId);
  if (!issue) throw new ApiError(404, 'Issue not found');

  const message = await tenantScoped(IssueMessage, schoolId).create({
    issueId: issue.id, authorUserId: userId, authorRole: 'STAFF', body,
  });
  await issue.update({ lastMessageAt: new Date() });

  const parent = await tenantScoped(Parent, schoolId).findByPk(issue.parentId);
  if (parent?.userId) {
    await notificationsService.createNotifications(schoolId, [parent.userId], {
      type: 'ISSUE_MESSAGE',
      title: 'New reply from the school',
      body: issue.subject,
      linkUrl: `/parent/issues/${issue.id}`,
    });
  }
  return message;
}

async function updateIssueStatus(schoolId, issueId, status) {
  const issue = await tenantScoped(Issue, schoolId).findByPk(issueId);
  if (!issue) throw new ApiError(404, 'Issue not found');
  await issue.update({ status });
  return issue;
}

async function countOpenIssues(schoolId) {
  return tenantScoped(Issue, schoolId).count({ where: { status: 'OPEN' } });
}

module.exports = {
  createIssue,
  listIssuesForParent,
  getIssueForParent,
  addParentMessage,
  listIssuesForStaff,
  getIssueForStaff,
  addStaffMessage,
  updateIssueStatus,
  countOpenIssues,
};

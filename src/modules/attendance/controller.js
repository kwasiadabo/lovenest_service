const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getMyClasses = wrap(async (req, res) => {
  res.json(await service.getMyClasses(req.schoolId, req.auth.userId, req.auth.roles));
});

const getRegister = wrap(async (req, res) => {
  const { classId, termId, date } = req.query;
  res.json(await service.getRegister(req.schoolId, req.auth.userId, req.auth.roles, { classId, termId, date }));
});

const saveRegister = wrap(async (req, res) => {
  res.json(await service.saveRegister(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const getSummary = wrap(async (req, res) => {
  const { classId, studentId, termId } = req.query;
  res.json(await service.getAttendanceSummaryForCaller(req.schoolId, req.auth.userId, req.auth.roles, {
    classId, studentId, termId,
  }));
});

const getClassReport = wrap(async (req, res) => {
  const { classId, termId } = req.query;
  res.json(await service.getClassAttendanceReport(req.schoolId, req.auth.userId, req.auth.roles, { classId, termId }));
});

const getAnalytics = wrap(async (req, res) => {
  const { academicYearId, termId, classId } = req.query;
  res.json(await service.getAttendanceAnalytics(req.schoolId, {
    academicYearId, termId, classIds: classId ? [classId] : undefined,
  }));
});

const getMyAnalytics = wrap(async (req, res) => {
  const { academicYearId, termId, classId } = req.query;
  res.json(await service.getMyAttendanceAnalytics(req.schoolId, req.auth.userId, req.auth.roles, {
    academicYearId, termId, classId: classId || undefined,
  }));
});

const getMyRegisterStatus = wrap(async (req, res) => {
  res.json(await service.getMyRegisterStatusToday(req.schoolId, req.auth.userId, req.auth.roles));
});

const getDailyOverview = wrap(async (req, res) => {
  const { date } = req.query;
  res.json(await service.getDailyOverview(req.schoolId, { date: date || undefined }));
});

const getAttendanceSettings = wrap(async (req, res) => {
  res.json(await service.getAttendanceSettings(req.schoolId));
});

const updateAttendanceSettings = wrap(async (req, res) => {
  res.json(await service.updateAttendanceSettings(req.schoolId, req.body));
});

module.exports = {
  getMyClasses,
  getRegister,
  saveRegister,
  getSummary,
  getClassReport,
  getAnalytics,
  getMyAnalytics,
  getMyRegisterStatus,
  getDailyOverview,
  getAttendanceSettings,
  updateAttendanceSettings,
};

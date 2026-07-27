const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { User, Role, School, TrainingEnrollment } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/jwt');

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const GENERIC_RESET_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function login(email, password) {
  const user = await User.findOne({
    where: { email },
    include: [
      { model: Role, through: { attributes: [] } },
      { model: School, include: [{ model: TrainingEnrollment }] },
    ],
  });

  if (!user || user.status !== 'active') {
    throw new ApiError(401, 'Invalid email or password');
  }

  // Pending/trial school users must still be able to log in (pending needs
  // to reach plan selection; trial is a normal working state) — only a
  // suspended school (manual block/suspend/deactivate, or the reminder
  // cron's auto-suspend on non-payment) cuts off login.
  if (user.School && user.School.status === 'suspended') {
    throw new ApiError(403, "This school's account is suspended. Contact the platform administrator.");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const roles = user.Roles.map((role) => role.name);
  const tokenPayload = { userId: user.id, schoolId: user.schoolId, roles };

  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      schoolId: user.schoolId,
      roles,
      forcePasswordChange: user.forcePasswordChange,
      schoolStatus: user.School ? user.School.status : null,
      schoolName: user.School ? user.School.name : null,
      schoolLogoUrl: user.School ? user.School.logoUrl : null,
      schoolAddress: user.School ? user.School.address : null,
      schoolPhone: user.School ? user.School.phone : null,
      schoolEmail: user.School ? user.School.email : null,
      schoolPlanCode: user.School ? user.School.planCode : null,
      subscriptionExpiresAt: user.School ? user.School.subscriptionExpiresAt : null,
      // null for schools provisioned before this feature existed (no
      // TrainingEnrollment row) — RequireActiveSchool.jsx only redirects on
      // the explicit string 'pending', never on this being absent.
      trainingPaymentStatus: user.School?.TrainingEnrollment?.paymentStatus || null,
    },
  };
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findOne({
    where: { id: payload.userId },
    include: [{ model: Role, through: { attributes: [] } }, { model: School }],
  });

  if (!user || user.status !== 'active') {
    throw new ApiError(401, 'Account no longer active');
  }

  // Re-checked on every refresh (access tokens are short-lived, see
  // JWT_ACCESS_EXPIRES_IN) so a school suspended mid-session is cut off
  // within one token lifetime, same mechanism as the user.status check above.
  if (user.School && user.School.status === 'suspended') {
    throw new ApiError(401, 'Account no longer active');
  }

  const roles = user.Roles.map((role) => role.name);
  const tokenPayload = { userId: user.id, schoolId: user.schoolId, roles };

  return {
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
  };
}

// Deliberately returns the same generic message whether or not the email is
// registered, so this endpoint can't be used to enumerate accounts.
async function requestPasswordReset(email) {
  const user = await User.findOne({ where: { email } });

  if (user && user.status === 'active') {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = hashResetToken(rawToken);
    user.resetPasswordExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // No email/SMS provider is wired up yet, so log the link for local testing.
    console.log(`[password reset] ${email}: ${resetUrl}`);

    if (process.env.NODE_ENV !== 'production') {
      return { message: GENERIC_RESET_MESSAGE, resetUrl, resetToken: rawToken };
    }
  }

  return { message: GENERIC_RESET_MESSAGE };
}

async function resetPassword(token, newPassword) {
  const user = await User.findOne({ where: { resetPasswordTokenHash: hashResetToken(token) } });

  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new ApiError(400, 'Invalid or expired reset link');
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  await user.save();

  return { message: 'Password updated. You can now sign in.' };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findByPk(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.forcePasswordChange = false;
  await user.save();

  return { message: 'Password updated.' };
}

module.exports = { login, refresh, requestPasswordReset, resetPassword, changePassword };

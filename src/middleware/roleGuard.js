const ApiError = require('../utils/ApiError');

// Route guard restricting an endpoint to one or more roles (§3 of the plan).
// Must run after `authenticate`. Note: fine-grained scoping (e.g. a Class
// Teacher limited to their own class) is enforced separately, inside each
// module's service layer, re-checked per request against current-year
// assignment records — never cached at login.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roles = (req.auth && req.auth.roles) || [];
    const allowed = roles.some((role) => allowedRoles.includes(role));
    if (!allowed) {
      return next(new ApiError(403, 'Insufficient role for this action'));
    }
    return next();
  };
}

module.exports = { requireRole };

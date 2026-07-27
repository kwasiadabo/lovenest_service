// School.emailAppPasswordEncrypted must never reach a JSON response — every
// query whose result can flow to res.json() (directly, or nested under
// another key like `{ school }`) should spread this into its options.
const SCHOOL_SAFE_ATTRIBUTES = { attributes: { exclude: ['emailAppPasswordEncrypted'] } };

module.exports = { SCHOOL_SAFE_ATTRIBUTES };

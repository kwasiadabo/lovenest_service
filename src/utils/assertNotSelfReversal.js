const ApiError = require('./ApiError');

// Segregation of duties: whoever originally recorded a payment or invoice
// must not be the one to delete/reverse it — a second authorized user has
// to sign off on undoing it. Deliberately called only at explicit
// delete/reverse call sites rather than inside ledgerPoster's shared
// reverseEntryFor/reverseEntryById — those also back "edit" (reverse-then-
// repost), and self-editing your own entry is still allowed.
function assertNotSelfReversal(recordedByUserId, reversingUserId) {
  if (recordedByUserId && reversingUserId && recordedByUserId === reversingUserId) {
    throw new ApiError(403, 'You cannot reverse a transaction you recorded yourself — ask another authorized user to do this.');
  }
}

module.exports = assertNotSelfReversal;

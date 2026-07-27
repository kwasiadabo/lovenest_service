const payrollService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getSalaryStructure = wrap(async (req, res) => {
  res.json(await payrollService.getSalaryStructure(req.schoolId, req.params.staffId));
});

const setSalaryStructure = wrap(async (req, res) => {
  res.status(201).json(
    await payrollService.setSalaryStructure(req.schoolId, req.params.staffId, req.auth.userId, req.body),
  );
});

const listPayrollRuns = wrap(async (req, res) => {
  res.json(await payrollService.listPayrollRuns(req.schoolId));
});

const getPayrollRun = wrap(async (req, res) => {
  res.json(await payrollService.getPayrollRun(req.schoolId, req.params.id));
});

const createPayrollRun = wrap(async (req, res) => {
  res.status(201).json(await payrollService.createPayrollRun(req.schoolId, req.auth.userId, req.body));
});

const approvePayrollRun = wrap(async (req, res) => {
  res.json(await payrollService.approvePayrollRun(req.schoolId, req.params.id, req.auth.userId));
});

const payPayrollRun = wrap(async (req, res) => {
  res.json(await payrollService.payPayrollRun(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const recordStatutoryRemittance = wrap(async (req, res) => {
  res.status(201).json(await payrollService.recordStatutoryRemittance(req.schoolId, req.auth.userId, req.body));
});

const listStatutoryRemittancesForRun = wrap(async (req, res) => {
  res.json(await payrollService.listStatutoryRemittancesForRun(req.schoolId, req.params.id));
});

const getPayslip = wrap(async (req, res) => {
  res.json(await payrollService.getPayslip(req.schoolId, req.params.id));
});

const emailPayslip = wrap(async (req, res) => {
  res.json(await payrollService.emailPayslip(req.schoolId, req.params.id));
});

const emailPayrollRunPayslips = wrap(async (req, res) => {
  res.json(await payrollService.emailPayrollRunPayslips(req.schoolId, req.params.id));
});

const listMyPayslips = wrap(async (req, res) => {
  res.json(await payrollService.listMyPayslips(req.schoolId, req.auth.userId));
});

const getMyPayslip = wrap(async (req, res) => {
  res.json(await payrollService.getMyPayslip(req.schoolId, req.auth.userId, req.params.id));
});

const getStatutorySettings = wrap(async (req, res) => {
  res.json(await payrollService.getStatutorySettings());
});

const getPayrollAnalytics = wrap(async (req, res) => {
  const { from, to, runIds } = req.query;
  const runIdList = typeof runIds === 'string' && runIds.length
    ? runIds.split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;
  res.json(await payrollService.getPayrollAnalytics(req.schoolId, { from, to, runIds: runIdList }));
});

module.exports = {
  getSalaryStructure,
  setSalaryStructure,
  listPayrollRuns,
  getPayrollRun,
  createPayrollRun,
  approvePayrollRun,
  payPayrollRun,
  recordStatutoryRemittance,
  listStatutoryRemittancesForRun,
  getPayslip,
  emailPayslip,
  emailPayrollRunPayslips,
  listMyPayslips,
  getMyPayslip,
  getStatutorySettings,
  getPayrollAnalytics,
};

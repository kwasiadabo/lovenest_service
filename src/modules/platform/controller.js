const platformService = require('./service');

// Multipart form fields arrive as strings even when left blank; treat blank
// optional fields as unset rather than storing empty strings.
function orUndefined(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

async function provisionSchool(req, res, next) {
  try {
    const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : undefined;
    const {
      name, code, address, phone, email, adminEmail, adminPassword,
      smsSenderId, emailUser, emailAppPassword, studentPopulation,
      trainingMode, trainingAttendeeCount,
    } = req.body;
    const result = await platformService.provisionSchool({
      name,
      code,
      address: orUndefined(address),
      phone: orUndefined(phone),
      email: orUndefined(email),
      logoUrl,
      adminEmail,
      adminPassword,
      smsSenderId: orUndefined(smsSenderId),
      emailUser: orUndefined(emailUser),
      emailAppPassword: orUndefined(emailAppPassword),
      studentPopulation: Number(studentPopulation),
      trainingMode,
      trainingAttendeeCount: Number(trainingAttendeeCount),
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function updateSchool(req, res, next) {
  try {
    const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : undefined;
    const {
      name, address, phone, email, studentPopulation,
      smsSenderId, emailUser, emailAppPassword,
    } = req.body;
    const school = await platformService.updateSchool(req.params.schoolId, {
      name: orUndefined(name),
      address: orUndefined(address),
      phone: orUndefined(phone),
      email: orUndefined(email),
      logoUrl,
      studentPopulation: orUndefined(studentPopulation) === undefined ? undefined : Number(studentPopulation),
      smsSenderId: orUndefined(smsSenderId),
      emailUser: orUndefined(emailUser),
      emailAppPassword: orUndefined(emailAppPassword),
    });
    res.json(school);
  } catch (err) {
    next(err);
  }
}

async function listSchools(req, res, next) {
  try {
    const schools = await platformService.listSchools();
    res.json(schools);
  } catch (err) {
    next(err);
  }
}

async function setSchoolStatus(req, res, next) {
  try {
    const school = await platformService.setSchoolStatus(req.params.schoolId, req.body.status);
    res.json(school);
  } catch (err) {
    next(err);
  }
}

function tenantAction(action) {
  return async (req, res, next) => {
    try {
      const school = await platformService.applyTenantAction(
        req.params.schoolId, action, req.auth.userId, req.body.note,
      );
      res.json(school);
    } catch (err) {
      next(err);
    }
  };
}

async function getTenantDetail(req, res, next) {
  try {
    const detail = await platformService.getTenantDetail(req.params.schoolId);
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

async function updateStudentPopulation(req, res, next) {
  try {
    const school = await platformService.updateStudentPopulation(req.params.schoolId, Number(req.body.studentPopulation));
    res.json(school);
  } catch (err) {
    next(err);
  }
}

async function getRevenueAnalytics(req, res, next) {
  try {
    res.json(await platformService.getRevenueAnalytics());
  } catch (err) {
    next(err);
  }
}

async function getTenantHealthAnalytics(req, res, next) {
  try {
    res.json(await platformService.getTenantHealthAnalytics());
  } catch (err) {
    next(err);
  }
}

async function getUsageAnalytics(req, res, next) {
  try {
    res.json(await platformService.getUsageAnalytics());
  } catch (err) {
    next(err);
  }
}

async function runReminderSweepNow(req, res, next) {
  try {
    res.json(await platformService.runReminderSweepNow());
  } catch (err) {
    next(err);
  }
}

async function getStatutorySettings(req, res, next) {
  try {
    const settings = await platformService.getStatutorySettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function setSsnitRate(req, res, next) {
  try {
    const rate = await platformService.setSsnitRate(req.body);
    res.status(201).json(rate);
  } catch (err) {
    next(err);
  }
}

async function setPayeTaxBands(req, res, next) {
  try {
    const bands = await platformService.setPayeTaxBands(req.body);
    res.status(201).json(bands);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  provisionSchool,
  listSchools,
  updateSchool,
  setSchoolStatus,
  blockSchool: tenantAction('block'),
  suspendSchool: tenantAction('suspend'),
  deactivateSchool: tenantAction('deactivate'),
  reactivateSchool: tenantAction('reactivate'),
  getTenantDetail,
  updateStudentPopulation,
  getRevenueAnalytics,
  getTenantHealthAnalytics,
  getUsageAnalytics,
  runReminderSweepNow,
  getStatutorySettings,
  setSsnitRate,
  setPayeTaxBands,
};

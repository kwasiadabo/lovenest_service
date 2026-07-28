const { cellToString, cellToDateOnly } = require('../parseHelpers');
const { matchStudent } = require('./matchStudent');

const BILLING_CYCLES = ['TERMLY', 'MONTHLY'];

// `context.studentIndex` — see matchStudent.js. `context.vehicleByName` is a
// Map<lowercased vehicle name, Vehicle>. `context.pickupPointsByVehicleId`
// is a Map<vehicleId, Map<lowercased pickup point name, PickupPoint>> —
// both pre-built once per file by service.js.
function parseTransportSubscriberRow(row, context) {
  const errors = [];

  const { student, error: matchError } = matchStudent(row, context.studentIndex);
  if (matchError) errors.push(matchError);

  const vehicleName = cellToString(row.vehicleName);
  let vehicle;
  if (!vehicleName) errors.push('Vehicle Name is required');
  else {
    vehicle = context.vehicleByName.get(vehicleName.toLowerCase());
    if (!vehicle) errors.push(`Vehicle "${vehicleName}" was not found — set it up under Transport first`);
    else if (vehicle.status !== 'ACTIVE') errors.push(`Vehicle "${vehicleName}" is inactive`);
  }

  const pickupPointName = cellToString(row.pickupPointName);
  let pickupPointId;
  if (pickupPointName && vehicle) {
    const points = context.pickupPointsByVehicleId.get(vehicle.id) || new Map();
    const point = points.get(pickupPointName.toLowerCase());
    if (!point) errors.push(`Pickup Point "${pickupPointName}" was not found on vehicle "${vehicleName}"`);
    else pickupPointId = point.id;
  }

  const billingCycle = cellToString(row.billingCycle).toUpperCase();
  if (!billingCycle) errors.push('Billing Cycle is required');
  else if (!BILLING_CYCLES.includes(billingCycle)) errors.push('Billing Cycle must be TERMLY or MONTHLY');

  const startDate = cellToDateOnly(row.startDate);
  if (!startDate) errors.push('Start Date is required');
  else if (startDate === undefined) errors.push('Start Date is not a valid date');

  if (errors.length > 0) return { errors };

  return {
    data: {
      studentId: student.id, vehicleId: vehicle.id, pickupPointId, billingCycle, startDate,
    },
  };
}

module.exports = { parseTransportSubscriberRow };

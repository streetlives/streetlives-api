// Directory eligibility is recorded service hours/status, not whether a service
// is open. Keep explicit closures and either time value; reject all-null hours.
const hasServiceHours = services => Array.isArray(services) && services.some(service =>
  service && Array.isArray(service.HolidaySchedules) && service.HolidaySchedules.some(schedule =>
    schedule && (schedule.closed === true ||
      schedule.opens_at != null || schedule.closes_at != null)));

export default hasServiceHours;

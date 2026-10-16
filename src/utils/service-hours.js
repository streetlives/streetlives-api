// YourPeer displays HolidaySchedules with both opening and closing times.
const hasServiceHours = services => Array.isArray(services) && services.some(service =>
  service && Array.isArray(service.HolidaySchedules) && service.HolidaySchedules.some(schedule =>
    schedule && !!schedule.opens_at && !!schedule.closes_at));

export default hasServiceHours;

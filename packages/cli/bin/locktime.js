import { TimeUtils } from "@sundial-protocol/btc-locker";

export const validateLocktime = (input) => {
  if (input.match(/^\d+$/)) return true;
  if (input.match(/^\d+\s*(minute|hour|day|week|month|year)s?$/i))
    return true;
  return 'Please enter a Unix timestamp or duration like "1 week"';
}

export const parseLocktime = (input) => {
  let locktime = input;
    if (!locktime.match(/^\d+$/)) {
    const match = locktime.match(
      /^(\d+)\s*(minute|hour|day|week|month|year)s?$/i
    );
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const unitMap = {
        minute: TimeUtils.DURATIONS.MINUTE,
        hour: TimeUtils.DURATIONS.HOUR,
        day: TimeUtils.DURATIONS.DAY,
        week: TimeUtils.DURATIONS.WEEK,
        month: TimeUtils.DURATIONS.MONTH,
        year: TimeUtils.DURATIONS.YEAR,
      };
      const duration = amount * unitMap[unit];
      locktime = TimeUtils.addDuration(duration);
    }
  } else {
    locktime = parseInt(locktime);
  }
  return locktime;
}
/**
 * Business from the floor: what the chair records for people in the room, many without a
 * device, and for questions the chair puts from the agenda
 */

/** The mover of a question the chair puts from the agenda (MAKE_MOTION with putByChair) */
export const PUT_BY_CHAIR = 'Put by the chair';

/** Who nominated, for a nomination from the floor (NOMINATE with fromFloor) */
export const FROM_THE_FLOOR = 'From the floor';

/** Who seconded, for a second from the floor with no name given (SECOND_FROM_FLOOR) */
export const A_MEMBER_IN_THE_ROOM = 'a member in the room';

/** The longest name the chair can type for a mover or seconder from the floor */
export const MAX_FLOOR_NAME_LENGTH = 100;

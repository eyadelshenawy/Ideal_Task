// Shared markers for the customer-facing conversation thread. Any TaskEvent
// whose message starts with one of these is part of the back-and-forth
// visible to the customer on both the per-task tracking link and the
// project share link; every other comment stays internal to the team.
export const TO_CUSTOMER_PREFIX = "[To customer] ";
export const FROM_CUSTOMER_PREFIX = "[Customer] ";

export function isCustomerThreadMessage(message: string): boolean {
  return message.startsWith(TO_CUSTOMER_PREFIX) || message.startsWith(FROM_CUSTOMER_PREFIX);
}

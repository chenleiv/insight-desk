// What counts as one client in every per-address limit. An IPv6 customer normally controls a
// whole network and can change the rest of the address at will, so only its prefix is counted.
import { ipKeyGenerator } from 'express-rate-limit';

// Many ISPs give one customer a /56, which holds 256 /64 networks (see SECURITY.md).
export const IPV6_PREFIX = 56;

/**
 * The address as a limit counts it: an IPv6 address becomes its network, an IPv4-mapped one
 * becomes its IPv4 address, and IPv4 or an invalid value stays as it is.
 */
export function addressKey(address) {
    return ipKeyGenerator(address, IPV6_PREFIX);
}

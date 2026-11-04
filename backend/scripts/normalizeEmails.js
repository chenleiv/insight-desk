// Convert stored emails to the lowercase form login now looks up. Addresses that
// differ only by case would collide on the unique index, so they are reported and
// skipped: which account survives is a decision for a person, never for this script.
// Running it again after a clean run changes nothing.
// Usage: node backend/scripts/normalizeEmails.js --dry-run | --apply
import '../loadEnv.js';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { User } from '../models.js';
import { normalizeEmail } from '../schemas.js';

/** The requested mode, or null unless exactly one of the two flags is given. */
export function parseMode(args) {
    const dryRun = args.includes('--dry-run');
    const apply = args.includes('--apply');
    if (dryRun === apply) return null;
    return dryRun ? 'dry-run' : 'apply';
}

/** Enough to recognize an account in a report, without printing the full address. */
export function maskEmail(email) {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
}

/** Splits users into emails to rewrite and groups that would collide once normalized. */
export function planEmailMigration(users) {
    const groups = new Map();
    for (const user of users) {
        const email = normalizeEmail(user.email);
        groups.set(email, [...(groups.get(email) ?? []), user]);
    }
    const changes = [];
    const collisions = [];
    for (const [email, group] of groups) {
        if (group.length > 1) collisions.push({ email, users: group });
        else if (group[0].email !== email) changes.push({ id: group[0]._id, from: group[0].email, to: email });
    }
    return { changes, collisions };
}

/** Reports the plan, and writes it unless this is a dry run. Returns the counts. */
export async function runEmailMigration({ dryRun, log = console.log }) {
    const prefix = dryRun ? '[dry run] ' : '';
    const users = await User.find({}, 'email role createdAt').lean();
    const { changes, collisions } = planEmailMigration(users);

    for (const { email, users: group } of collisions) {
        log(`${prefix}COLLISION on ${maskEmail(email)}, skipped:`);
        for (const u of group) log(`${prefix}  ${u._id} ${maskEmail(u.email)} role=${u.role} created=${u.createdAt?.toISOString?.() ?? 'unknown'}`);
    }

    let updated = 0;
    let failed = 0;
    for (const { id, from, to } of changes) {
        if (dryRun) {
            log(`${prefix}${id}: would rewrite ${maskEmail(from)}`);
            continue;
        }
        try {
            // Matches the email too, so an address changed since the read is left alone.
            const { modifiedCount } = await User.updateOne({ _id: id, email: from }, { $set: { email: to } }, { timestamps: false });
            updated += modifiedCount;
        } catch (err) {
            failed++;
            log(`${id}: failed with code ${err.code ?? 'unknown'}`);
        }
    }

    log(`${prefix}${users.length} users, ${changes.length} to rewrite, ${updated} rewritten, `
        + `${collisions.length} collisions, ${failed} failed.`);
    return { total: users.length, toRewrite: changes.length, updated, collisions: collisions.length, failed };
}

async function main() {
    const mode = parseMode(process.argv.slice(2));
    if (!mode) {
        console.error('Usage: node backend/scripts/normalizeEmails.js --dry-run | --apply');
        process.exitCode = 1;
        return;
    }
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    // Host and database name only, so the target can be checked; never the URI or credentials.
    const { host, name } = mongoose.connection;
    console.log(`${mode === 'dry-run' ? '[dry run] ' : ''}Connected to ${host}, database ${name}`);
    const { collisions, failed } = await runEmailMigration({ dryRun: mode === 'dry-run' });
    if (collisions || failed) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main()
        .catch((err) => {
            console.error('Email migration failed:', err.message);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

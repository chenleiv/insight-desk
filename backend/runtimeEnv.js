// Development and test must be named explicitly. Anything else, including an
// unset NODE_ENV, gets production's safe settings, so a partial configuration
// fails closed. ENV=prod always means production.
export function isDevOrTest() {
    return process.env.ENV !== 'prod' && ['development', 'test'].includes(process.env.NODE_ENV);
}

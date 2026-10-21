// Tests describe self-hosted behavior unless they opt in with
// setBillingConfigForTests, so a developer's local Cloud billing settings in
// .env must not leak in. dotenv never overrides variables that are already set.
process.env.DURABULL_BILLING_ENABLED = 'false'

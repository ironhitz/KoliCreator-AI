# AI Security Policy

This document describes the security boundaries and vulnerability-reporting process for KoliCreator AI's AI features. The application is a hackathon sandbox, not a production financial or autonomous decision-making service.

## AI feature scope

- The Revenue Agent accepts creator-reported audience/revenue inputs and optional free text, then returns editable strategies, product ideas, campaign drafts, and a launch checklist.
- Transaction insights use verified transaction aggregates and product-catalogue context for the authenticated creator. The database aggregate function is executable only by the Supabase service role.
- Both endpoints require an authenticated user and use database-backed per-user rate limits. AI output is schema-validated before it is returned. The server calculates target-gap and required-sales arithmetic; those figures are scenarios, not forecasts.
- Suggestions are drafts. The app does not execute model-proposed actions, publish campaigns automatically, or let the model access payment credentials or call tools.

## Data handling and trust boundaries

- The AI provider receives the inputs needed for each request: creator-reported metrics and free text, plus the creator's limited catalogue and six-month transaction aggregates for context. Transaction-level payment details are not sent as AI learning context.
- AI requests are processed by the configured OpenAI API using the server-side `OPENAI_API_KEY`. The application does not maintain separate AI memory or use this data to fine-tune a model. Provider-side processing and retention are governed by the provider's current terms and settings; do not submit secrets or sensitive personal information.
- Creator-provided text, catalogue names and descriptions, and model output are untrusted. Prompt instructions ask the model not to follow instructions embedded in supplied data, but this is a mitigation, not a guarantee.
- Model output is constrained and validated by the server. The user must review and edit drafts before publishing. The application renders output as text; it must never be interpreted as HTML, SQL, code, or authorization.
- Supabase service-role and OpenAI secrets stay server-side. Do not place them in client code, prompts, logs, source control, or public issue reports.

## Safe-use guidance

- Never rely on AI suggestions as financial, legal, tax, or payment advice, or as a guarantee of sales or revenue.
- Do not use AI-generated text without human review. Check factual claims, prices, rights to use content, and compliance with the intended platform before publishing.
- Treat unexpected content, instruction-following behavior, cross-account data exposure, or disclosure of sensitive information as a security issue. Do not try to bypass another user's account boundaries.

## Reporting a vulnerability

Please do not publish exploitable vulnerability details in a public issue. Report them privately to the repository maintainers through GitHub; use GitHub's private vulnerability reporting feature if it is enabled for this repository. Include the affected route or component, impact, and concise reproduction steps. Do not include real credentials, personal data, or other users' information.

This project has no guaranteed response-time or service-level commitment. Maintainers will assess reports on a best-effort basis and coordinate disclosure after a fix or mitigation is available.

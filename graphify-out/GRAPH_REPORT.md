# Graph Report - floortest  (2026-10-20)

## Corpus Check
- Large corpus: 615 files · ~350,341 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3213 nodes · 11092 edges · 146 communities (123 shown, 23 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 167 edges (avg confidence: 0.86)
- Token cost: 526,264 input · 0 output

## Community Hubs (Navigation)
- Collection Share Links
- Track Upload Completion
- Admin Accounts & Actions
- Review, Listened & Download
- Dashboard Collections & Config
- Admin UI & Feature Switches
- App API Sessions (/api/v1)
- Storage & Signed Audio
- Decisions & Reply Templates
- Player & Up Next
- Sign-up & Password Auth
- Email Webhooks & Incidents
- Email Confirm & Contact
- Database & Migrations
- Team Comments & Shortlist
- Node Test Harness
- Desk, Notifications & Public Page
- Crate Export & Stems
- Plans & Plan Preview
- Intake Uploads
- Site Editor & Claim Box
- Backups & Restore Drill
- E2E Test Suite
- Auth Forms & Site Gate UI
- Cron Jobs & Notify
- Google Sign-in
- Ops Permissions
- Queue List & Filters
- Sender Upload Metadata
- Login Route & Human Check
- Capacitor Mobile Config
- Admin Overview & Allowance
- Android Now Playing Service
- Deletion Queue & Retention
- Activity & Audit Log
- Beta Plan & Finance Notes
- QR, Waitlist & Monitoring
- Android Capacitor Plugins
- Auth Layout & Sidebar
- Link Card & Account Page
- Two-step Sign-in (TOTP)
- Admin Audience & Announcements
- Admin Metrics & Revenue
- Design Audit & Motion Loops
- Settings & Public Page Form
- Product Requirements Docs
- Legal Review & Launch Checklist
- Operations Runbook
- Ops Sessions & View-as
- Legal Pages
- Sender Receipt
- Android Main Activity
- Package & Lint Config
- Scanner Server (ClamAV)
- Login & Signup Pages
- Proxy & Site Gate
- Desk Bar & Feedback
- Collection Forms & Cards
- README Stack & Uptime
- Design System
- Site Content Editing
- Genres & Trust Page
- Folder Send & Choices
- TypeScript Config
- iOS Offline Crate
- Technical Requirements
- Cloudflare Scanner Worker
- Email Copy Editor
- Admin Navigation
- Send Composer & Brief
- Played Out Prompt
- Sent History & Reopen
- Unsubscribe (RFC 8058)
- Product Principles & P1 Gate
- API Guide & Index
- QR Dialog & Search
- Sentry & Page Views
- Admin Layout & Theme
- Keyboard Shortcuts & Account Settings
- Sender Email Code
- Android Share Inbox
- iOS Main View Controller
- Password Hashing & Breach Check
- Draft Preview
- Forgot Password Flow
- Cookies & Privacy Pages
- Home Stage (Jog Wheel)
- Agent Working Rules
- iOS App Delegate
- Public Submit Route
- Implementation Plan
- Release Evidence Reports
- Runtime Dependencies
- Audio File Validation
- iOS Offline Plugin
- Data & Permissions Docs
- Rollout Brief & Visuals
- iOS Share Extension
- npm Scripts
- Offline Save (Web)
- Security Policy
- Pentest Brief & Retired
- iOS Share Inbox
- Dev Dependencies
- Storage Audit
- Sender Codes
- Root Layout & Tap Speed
- Android Instrumented Test
- Social Links
- iOS App Imports
- Brand & Sales
- Desk Role Check Script
- Folder Send Uploads
- Android Offline Plugin
- Notification Settings
- Scanner & Uptime Docs
- Session Management
- Working Council & Release
- Revenue Model
- Android Asset Script
- Bucket Copy Script
- Scanner Package
- Stress Test Script
- Admin Security Page
- Admin Usage Page
- Live Pulse
- Transfer Screen
- Store Listing
- Admin Feedback
- Admin Speed
- Mobile Start Page Script
- Smoke Test Script
- Vercel Config
- iOS Swift Package
- PostCSS Config
- Scanner Start Script

## God Nodes (most connected - your core abstractions)
1. `now()` - 223 edges
2. `next` - 178 edges
3. `q` - 139 edges
4. `react` - 99 edges
5. `audit()` - 87 edges
6. `sendMail()` - 78 edges
7. `server-only` - 77 edges
8. `requireUser()` - 75 edges
9. `allow()` - 73 edges
10. `requireAdmin()` - 72 edges

## Surprising Connections (you probably didn't know these)
- `04 Design brief` --semantically_similar_to--> `Design System: FloorTest`  [INFERRED] [semantically similar]
  docs/04-design.md → DESIGN.md
- `/api/health debugging` --semantically_similar_to--> `Health check step (/api/health ok:true)`  [INFERRED] [semantically similar]
  docs/15. Debugging.md → .github/workflows/uptime.yml
- `PGlite embedded Postgres locally` --semantically_similar_to--> `Neon Postgres (London)`  [INFERRED] [semantically similar]
  README.md → docs/02-technical.md
- `Definition of done` --semantically_similar_to--> `Pre-push checks (typecheck, lint, test, check:perms, e2e)`  [INFERRED] [semantically similar]
  docs/10. Feature Development.md → AGENTS.md
- `Colour tokens (src/app/globals.css)` --semantically_similar_to--> `The Token Only Rule`  [INFERRED] [semantically similar]
  docs/04-design.md → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sender-visible signal integrity (Listened, Downloaded, honest receipt)** — product_honest_signals, product_listened_30s, security_trustworthy_signals, docs_06_plan_p1_server_listened, docs_06_plan_event_ledger, readme_streamed_downloads [INFERRED 0.85]
- **Pre-beta release gate (P1 fixes, readiness, five-person cohort)** — docs_06_plan_five_person_prebeta, docs_06_plan_p1_offline_revocation, docs_06_plan_p1_server_listened, docs_06_plan_p1_scanner_readiness, docs_06_plan_liveness_vs_readiness, docs_14__testing___qa_prebeta_gate [EXTRACTED 1.00]
- **Production stack (Vercel, Neon, R2, Resend, Sentry)** — docs_02_technical_vercel_lhr1, docs_02_technical_neon_postgres, docs_02_technical_cloudflare_r2, docs_02_technical_resend_email, docs_02_technical_sentry_monitoring, docs_02_technical_vercel_cron [EXTRACTED 1.00]
- **One evidence report per production release (working rule 13)** — docs_evidence_readme_report_format, docs_evidence_2026_10_15_beta_scope_774b06a, docs_evidence_2026_10_15_owner_two_step_28b9d5b, docs_evidence_2026_10_15_password_hardening_01630c4, docs_evidence_2026_10_18_docs_15_standard_cacb29a [EXTRACTED 1.00]
- **15 Oct auth hardening (scrypt, HIBP, sessions, owner two-step)** — docs_evidence_2026_10_15_password_hardening_01630c4_scrypt_hashing, docs_evidence_2026_10_15_password_hardening_01630c4_hibp_check, docs_evidence_2026_10_15_password_hardening_01630c4_session_devices, docs_evidence_2026_10_15_owner_two_step_28b9d5b_owner_two_step_rule [INFERRED 0.85]
- **Money model: plans, Paddle fees, running costs, finance rules** — docs_beta_launch_plan_plan_tiers, docs_costs_paddle_fees, docs_costs_monthly_by_service, docs_finance_rules_of_the_house, docs_finance_paid_share_metric [INFERRED 0.85]
- **Nightly backup, vault copy and deletion queue** — docs_operations_cron_purge, docs_operations_encrypted_backups, docs_operations_vault_recovery_copy, docs_operations_storage_deletion_queue, docs_operations_retention_policy [EXTRACTED 1.00]
- **Three product motion loops M1-M3** — docs_rollout_motion_m1_track_lands_doc, docs_rollout_motion_m2_receipt_listened_doc, docs_rollout_motion_m3_keep_doc, docs_rollout_motion_readme_doc, docs_rollout_motion_readme_reduced_motion_posters [EXTRACTED 1.00]
- **Upload, scan and storage pipeline** — docs_operations_direct_to_r2_uploads, docs_operations_r2_bucket_floortest_audio_eu, src_lib_scan, scanner_readme_clamav_scanner, scanner_readme_fail_closed [INFERRED 0.85]

## Communities (146 total, 23 thin omitted)

### Community 0 - "Collection Share Links"
Cohesion: 0.05
Nodes (97): GET(), maxDuration, runtime, acceptNotice(), askToJoin(), checkCode(), err(), GateState (+89 more)

### Community 1 - "Track Upload Completion"
Cohesion: 0.06
Nodes (71): bad(), maxDuration, POST(), runtime, DELETE(), POST(), runtime, POST() (+63 more)

### Community 2 - "Admin Accounts & Actions"
Cohesion: 0.12
Nodes (82): addNote(), addOpsMember(), addPlan(), addPlatformBlock(), addProtectedName(), adminCancelEmailChange(), adminChangeEmail(), adminChangeHandle() (+74 more)

### Community 3 - "Review, Listened & Download"
Cohesion: 0.08
Nodes (70): GET(), maxDuration, runtime, POST(), runtime, answerHeldReply(), BatchResult, batchTracks() (+62 more)

### Community 4 - "Dashboard Collections & Config"
Cohesion: 0.06
Nodes (53): nextConfig, securityHeaders, next, NewCollection(), Collections(), metadata, ContactMenu(), Avatar() (+45 more)

### Community 5 - "Admin UI & Feature Switches"
Cohesion: 0.07
Nodes (48): ConfirmButton(), ConfirmSubmit(), ImageField(), Blocks(), PAGES, SiteContent(), DELIVERY, Emails() (+40 more)

### Community 6 - "App API Sessions (/api/v1)"
Cohesion: 0.09
Nodes (48): GET(), runtime, POST(), runtime, POST(), runtime, GET(), runtime (+40 more)

### Community 7 - "Storage & Signed Audio"
Cohesion: 0.07
Nodes (35): POST(), runtime, GET(), runtime, collectionOf(), DELETE(), GET(), ownCollection() (+27 more)

### Community 8 - "Decisions & Reply Templates"
Cohesion: 0.08
Nodes (38): BatchAction, decideTrack(), deleteReplyTemplate(), getReplyTemplates(), saveReplyTemplate(), templatesOf(), undoDecision(), DecisionRail() (+30 more)

### Community 9 - "Player & Up Next"
Cohesion: 0.11
Nodes (37): DetailPlayer(), Item, UpNext(), MobileTransport(), KeptCards(), KeptCardsList(), KeptRow(), Row (+29 more)

### Community 10 - "Sign-up & Password Auth"
Cohesion: 0.09
Nodes (40): afterPassword(), codeHash(), createAccount(), DUMMY_HASH, enterTeam(), FormState, fromForm(), joinTeamAfterSignup() (+32 more)

### Community 11 - "Email Webhooks & Incidents"
Cohesion: 0.09
Nodes (31): server-only, Event, POST(), runtime, verified(), askReopenAlert(), ReopenState, joinNewsletter() (+23 more)

### Community 12 - "Email Confirm & Contact"
Cohesion: 0.10
Nodes (37): requestPasswordReset(), ConfirmEmail(), confirm(), metadata, ContactState, sendContact(), ContactForm(), Contact() (+29 more)

### Community 13 - "Database & Migrations"
Cohesion: 0.07
Nodes (30): 4. DATABASE (summary index), FloorTest Database Guide, Data model: users, collections, senders, releases, tracks, events, @electric-sql/pglite, postgres, checkOnly, compare(), count() (+22 more)

### Community 14 - "Team Comments & Shortlist"
Cohesion: 0.10
Nodes (33): commentOnTrack(), deleteComment(), shortlistTrack(), NoteForm(), DesktopOnly(), MobileOnly(), useWide(), Emails() (+25 more)

### Community 15 - "Node Test Harness"
Cohesion: 0.16
Nodes (7): KINDS, botHostnames(), desk(), kept(), WED, makeSetup(), setup()

### Community 16 - "Desk, Notifications & Public Page"
Cohesion: 0.13
Nodes (38): Account(), day(), when(), generateMetadata(), Props, ReceiverPage(), forwardedHandle(), briefItems() (+30 more)

### Community 17 - "Crate Export & Stems"
Cohesion: 0.10
Nodes (33): GET(), maxDuration, runtime, attachment(), GET(), maxDuration, runtime, GET() (+25 more)

### Community 18 - "Plans & Plan Preview"
Cohesion: 0.14
Nodes (31): num(), one(), Params, PlanPreview(), confirmBetaUpgrade(), requestPlan(), SettingsState, Checkout() (+23 more)

### Community 19 - "Intake Uploads"
Cohesion: 0.11
Nodes (33): bad(), POST(), runtime, maxDuration, POST(), runtime, bad(), maxDuration (+25 more)

### Community 20 - "Site Editor & Claim Box"
Cohesion: 0.08
Nodes (30): ClaimBox(), clean(), HELP, mono, serif, bars(), COLLECTIONS, HomePreview() (+22 more)

### Community 21 - "Backups & Restore Drill"
Cohesion: 0.12
Nodes (24): main(), PUT(), runtime, ageOut(), backupSecret(), keyFrom(), MAGIC, openBackup() (+16 more)

### Community 22 - "E2E Test Suite"
Cohesion: 0.14
Nodes (19): sender, stamp, wavFile(), FAKE_TURNSTILE, logIn(), submitLogin(), test, TEST_PASSWORD (+11 more)

### Community 23 - "Auth Forms & Site Gate UI"
Cohesion: 0.13
Nodes (24): react, Field, GateForm(), ComingSoon(), metadata, SignInDialog(), signOutDevice(), signOutOtherDevices() (+16 more)

### Community 24 - "Cron Jobs & Notify"
Cohesion: 0.10
Nodes (31): Jobs(), metadata, Run, summary(), GET(), maxDuration, runtime, GET() (+23 more)

### Community 25 - "Google Sign-in"
Cohesion: 0.12
Nodes (30): Account, GET(), runtime, GET(), runtime, approveGoogleLink(), ConnectGoogle(), metadata (+22 more)

### Community 26 - "Ops Permissions"
Cohesion: 0.12
Nodes (26): actions, actionsFile, problems, root, walk(), Member, OpsTeam(), adminReady() (+18 more)

### Community 27 - "Queue List & Filters"
Cohesion: 0.12
Nodes (27): quickSearch(), FilterMenu(), Option, ListRow, BPM, MIX_SHORT, Search, STATUS (+19 more)

### Community 28 - "Sender Upload Metadata"
Cohesion: 0.10
Nodes (28): music-metadata, Item, OwnerUpload(), pick(), sendAll(), upload(), CANCELLED, Fields (+20 more)

### Community 29 - "Login Route & Human Check"
Cohesion: 0.18
Nodes (25): DUMMY, POST(), runtime, login(), requestLoginCode(), verifySecondStep(), LoginCodePage(), metadata (+17 more)

### Community 30 - "Capacitor Mobile Config"
Cohesion: 0.06
Nodes (30): config, site, dependencies, @capacitor/android, @capacitor/core, @capacitor/haptics, @capacitor/ios, @capacitor/splash-screen (+22 more)

### Community 31 - "Admin Overview & Allowance"
Cohesion: 0.11
Nodes (28): AdminOverview(), ago(), dur(), Spark(), tileOf(), Todo, Tone, ago() (+20 more)

### Community 33 - "Deletion Queue & Retention"
Cohesion: 0.17
Nodes (22): toPositional(), accountKeys(), Deleter, drainDeletions(), handOverFolderCovers(), queueDeletion(), STUCK_AFTER, trackKeys() (+14 more)

### Community 34 - "Activity & Audit Log"
Cohesion: 0.11
Nodes (24): Activity(), EMPTY, EVENT, FILTERS, Key, metadata, clock(), dayKey() (+16 more)

### Community 35 - "Beta Plan & Finance Notes"
Cohesion: 0.10
Nodes (25): Beta launch plan and pitch prep, Beta metrics (25 activated, 15 weekly active, 5% sender to receiver), 10 design partners by hand (weeks 1-2), Add-ons for Free users (parked), Live updates backlog: light polling then SSE, Pitch prep (30-second version, deck story, investor Q&A), Plan tiers: Free (20 active tracks) / Pro / Team, Sender-to-receiver growth loop (+17 more)

### Community 36 - "QR, Waitlist & Monitoring"
Cohesion: 0.14
Nodes (21): qrcode, qrcode, POST(), runtime, GET(), runtime, POST(), runtime (+13 more)

### Community 38 - "Auth Layout & Sidebar"
Cohesion: 0.14
Nodes (17): AuthLayout(), PauseState, Props, Sidebar(), Licenses, metadata, Confirm(), metadata (+9 more)

### Community 39 - "Link Card & Account Page"
Cohesion: 0.14
Nodes (19): LinkCard(), Account(), Icon(), initials(), metadata, Row(), Section(), OPTIONS (+11 more)

### Community 40 - "Two-step Sign-in (TOTP)"
Cohesion: 0.21
Nodes (21): confirmTwoFactor(), disableTwoFactor(), setSigninAlerts(), startTwoFactor(), TwoFactor(), base32Decode(), base32Encode(), hashRecovery() (+13 more)

### Community 41 - "Admin Audience & Announcements"
Cohesion: 0.23
Nodes (19): Senders(), Tabs(), Users(), publishAnnouncement(), Announcements(), AudienceFields(), GET(), runtime (+11 more)

### Community 42 - "Admin Metrics & Revenue"
Cohesion: 0.17
Nodes (18): Metrics(), PeriodPicker(), money(), Revenue(), DECIDE_WITHIN, northStar, NorthStarRow, day() (+10 more)

### Community 43 - "Design Audit & Motion Loops"
Cohesion: 0.11
Nodes (23): One light rule (single lime point), Sender's private receipt /receipt/<token>, Accessibility findings (6 serious, WCAG), Audit batch 1: lime, names, sender safety, Audit batch 2: phone review docked rail, swipe v2, Audit batch 3: one track row, crate lists, Desk design audit 13 Oct, Early upload before Send (parked) (+15 more)

### Community 44 - "Settings & Public Page Form"
Cohesion: 0.18
Nodes (17): updatePublicPage(), updateSettings(), CoverUpload(), PLACEHOLDER, PublicPageForm(), SaveBar(), SettingsForm(), AccountType (+9 more)

### Community 45 - "Product Requirements Docs"
Cohesion: 0.10
Nodes (22): 01 Product requirements, Account teams (switch teams), Account types, Collections (one per callout), Edit the site on the page (ops), Floor (home), north-star metric (src/lib/north-star.ts), Prepare (Download kept, Rekordbox XML) (+14 more)

### Community 46 - "Legal Review & Launch Checklist"
Cohesion: 0.10
Nodes (20): 8. Project Implementation (summary index), Invite-only private beta, 1 Nov 2026 (after five-person pre-beta), Two-step direct-to-storage submission protocol, Before public launch checklist (pentest, lawyer, AV, payments, a11y), Own ClamAV virus scanner on Cloudflare Containers, Monthly cost by service (beta ~$55-60, launch $110-170), Recovery copy vault bucket (floortest-vault), Backups, restore drills and recovery copy (+12 more)

### Community 47 - "Operations Runbook"
Cohesion: 0.14
Nodes (22): Daily /api/cron/digest job, Nightly /api/cron/purge job, Signed-URL direct uploads to R2, FloorTest operations runbook, Encrypted nightly backups (BACKUP_KEY), Admin feature switches, Admin incidents and alerts, Neon Postgres database (+14 more)

### Community 48 - "Ops Sessions & View-as"
Cohesion: 0.19
Nodes (18): GET(), GET(), opsSignOut(), metadata, OpsLogin(), isAdminEmail(), signViewAs(), previewing (+10 more)

### Community 49 - "Legal Pages"
Cohesion: 0.14
Nodes (15): ContentRules(), metadata, HOST, LawEnforcement(), metadata, metadata, PrivacyChoices(), metadata (+7 more)

### Community 50 - "Sender Receipt"
Cohesion: 0.16
Nodes (16): stopSharing(), metadata, Receipt(), Baseline, ReachedSteps(), SignalDot(), StatusHeadline(), Item (+8 more)

### Community 52 - "Package & Lint Config"
Cohesion: 0.10
Nodes (19): config, engines, node, @aws-sdk/client-s3, typescript, name, private, version (+11 more)

### Community 53 - "Scanner Server (ClamAV)"
Cohesion: 0.12
Nodes (8): @aws-sdk/s3-request-presigner, scanStream(), clamd, s3, BucketCheck, ExpectedFile, headIn(), s3()

### Community 54 - "Login & Signup Pages"
Cohesion: 0.24
Nodes (16): GOOGLE_ERRORS, LoginPage(), metadata, metadata, SignupPage(), TYPE_CHOICES, metadata, Pricing() (+8 more)

### Community 55 - "Proxy & Site Gate"
Cohesion: 0.21
Nodes (17): unlockSite(), GET(), localPath(), GATE_COOKIE, GATE_DAYS, gatePassword(), gateToken(), hasGatePass() (+9 more)

### Community 56 - "Desk Bar & Feedback"
Cohesion: 0.18
Nodes (15): sendFeedback(), Desk, DeskBar(), FeedbackButton(), DashboardLayout(), Icon(), MobileTabBar(), QueueBadge() (+7 more)

### Community 57 - "Collection Forms & Cards"
Cohesion: 0.20
Nodes (17): ArtUpload(), C, CollectionCard(), CollectionDetailHeader(), CollectionOptions(), CollectionTile(), DeleteCollection(), EditCollectionInfo() (+9 more)

### Community 58 - "README Stack & Uptime"
Cohesion: 0.11
Nodes (17): Uptime workflow, Health check step (/api/health ok:true), 30-minute cron uptime ping, Cloudflare R2 bucket floortest-audio-eu, Neon Postgres (London), Audio bucket move to Europe, 12. MCP Connection, Neon MCP server (.mcp.json) (+9 more)

### Community 60 - "Design System"
Cohesion: 0.13
Nodes (13): Design System: FloorTest, Cue Lime accent (#d5ff48), Day theme, Four corner radii by role (8/12/16/22), JetBrains Mono single typeface, Review Row (signature component), 04 Design brief, Button system (btn-lime, btn-ghost, btn-danger) (+5 more)

### Community 61 - "Site Content Editing"
Cohesion: 0.19
Nodes (17): POST(), runtime, contentRow(), Copy, f(), Field, Kind, orderString() (+9 more)

### Community 62 - "Genres & Trust Page"
Cohesion: 0.16
Nodes (17): GenresField(), metadata, Trust(), ACCEPTED_MIME, DEFAULT_GENRES, LISTEN_MIN_FRACTION, LISTEN_MIN_SECONDS, MAX_COLLECTION_GENRES (+9 more)

### Community 63 - "Folder Send & Choices"
Cohesion: 0.25
Nodes (13): Item, Kind, AI_CHOICES, AI_HELP, Choice(), MIX_CHOICES, RELEASE_CHOICES, GenrePicker() (+5 more)

### Community 64 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 65 - "iOS Offline Crate"
Cohesion: 0.27
Nodes (5): Manifest, OfflineCrate, .folder, .manifestURL, Track

### Community 66 - "Technical Requirements"
Cohesion: 0.13
Nodes (18): 02 Technical requirements, App API /api/v1, Own sessions auth, scrypt, HIBP check, Rate limits (src/lib/ratelimit.ts), Row-level security on every table (check-rls), Sentry monitoring tunnel, Vault recovery copy (src/lib/vault.ts), Vercel Cron (digest, purge) (+10 more)

### Community 67 - "Cloudflare Scanner Worker"
Cohesion: 0.11
Nodes (14): @cloudflare/containers, wrangler, Scanner, worker, dependencies, @cloudflare/containers, devDependencies, wrangler (+6 more)

### Community 68 - "Email Copy Editor"
Cohesion: 0.24
Nodes (15): sendTestEmail(), EmailEditor(), IDS, EmailDef, EmailId, emailKey(), EMAILS, emailTemplate() (+7 more)

### Community 69 - "Admin Navigation"
Cohesion: 0.24
Nodes (12): AdminNav(), Icon(), IconName, NavItem, ExportButton(), PanelDetails(), ErrorPage(), reloadOnce() (+4 more)

### Community 70 - "Send Composer & Brief"
Cohesion: 0.21
Nodes (13): lookupReceiver(), SendComposer(), Brief(), FormProps, SendModes(), SendModeTabs(), ProfileLinks(), BriefItem (+5 more)

### Community 71 - "Played Out Prompt"
Cohesion: 0.27
Nodes (14): playedOutBatch(), skipPlayedOutPrompt(), metadata, PlayedOutPick(), PickForm(), canMarkPlayedOut(), closePlayedOutPrompt(), markableOnPrepare() (+6 more)

### Community 72 - "Sent History & Reopen"
Cohesion: 0.20
Nodes (12): ReopenAlert(), NewsletterForm(), metadata, Sent(), SentForm(), firstTouch(), RememberSource(), SourceField() (+4 more)

### Community 73 - "Unsubscribe (RFC 8058)"
Cohesion: 0.22
Nodes (13): RFC-8058, POST(), metadata, Unsubscribe(), confirm(), applyUnsubscribe(), checkUnsubToken(), emailTag() (+5 more)

### Community 74 - "Product Principles & P1 Gate"
Cohesion: 0.14
Nodes (13): Before public launch gate, Truthful append-only event ledger, P1: server-validated Listened signal, Paddle payments (planned), 1. PRD summary, Listened = 30 s of real playback, Paddle billing at public launch, Plans: Free / Pro / Team / add-on seats (+5 more)

### Community 75 - "API Guide & Index"
Cohesion: 0.14
Nodes (15): 5. API (summary index), /api/v1 mobile app API, Resend delivery webhook /api/webhooks/resend, Vercel Firewall rate limits (300/min /api, 60/min sign-in), 7. Readme (summary index), FloorTest Internal API Guide, Audio responses (signed URLs, app-authorized shared playback, byte ranges), Private capability links (high-entropy tokens) (+7 more)

### Community 76 - "QR Dialog & Search"
Cohesion: 0.21
Nodes (14): react-dom, QrDialog(), QrRow(), SearchHit, dayLabel(), initials(), Notifications(), NotificationsSheet() (+6 more)

### Community 77 - "Sentry & Page Views"
Cohesion: 0.23
Nodes (9): @sentry/nextjs, PageViews(), onRouterTransitionStart, onRequestError(), register(), redactUrl(), scrubEvent(), scrubSpan() (+1 more)

### Community 78 - "Admin Layout & Theme"
Cohesion: 0.20
Nodes (13): AdminMobileNav(), NavGroup, Toast(), AdminLayout(), dynamic, metadata, SkipLink(), readFlash() (+5 more)

### Community 79 - "Keyboard Shortcuts & Account Settings"
Cohesion: 0.18
Nodes (13): logout(), AccountSettings(), metadata, ShortcutsSwitch(), overlayOpen(), setShortcutsOn(), shortcutsOn(), shortcutTarget() (+5 more)

### Community 80 - "Sender Email Code"
Cohesion: 0.19
Nodes (15): EmailCode(), confirm(), resend(), post(), Result, startEmailCheck(), draftKey(), readDraftOnce() (+7 more)

### Community 82 - "iOS Main View Controller"
Cohesion: 0.13
Nodes (3): MainViewController, .routed, SceneDelegate

### Community 83 - "Password Hashing & Breach Check"
Cohesion: 0.17
Nodes (10): BREACHED_MESSAGE, breachedError(), pwnedCheckOn(), timesBreached(), Cost, CURRENT, derive(), LEGACY (+2 more)

### Community 84 - "Draft Preview"
Cohesion: 0.23
Nodes (13): GET(), runtime, check(), make(), passHolder(), PREVIEW_COOKIE, PREVIEW_MS, previewCookie() (+5 more)

### Community 85 - "Forgot Password Flow"
Cohesion: 0.17
Nodes (12): AuthForm(), check(), scrollBehavior(), ForgotPage(), metadata, EnterLoginCode(), metadata, metadata (+4 more)

### Community 86 - "Cookies & Privacy Pages"
Cohesion: 0.27
Nodes (11): Cookies(), metadata, metadata, Privacy(), metadata, Terms(), LEGAL, SHARING_LEGAL (+3 more)

### Community 87 - "Home Stage (Jog Wheel)"
Cohesion: 0.21
Nodes (13): ART, Bars(), DeckSection(), JogWheel(), LOG, PhoneQueue(), QUEUE, Sample() (+5 more)

### Community 88 - "Agent Working Rules"
Cohesion: 0.19
Nodes (9): AGENTS.md (working on FloorTest), Never rules (no secrets, no legal edits, no third-party hooks, no deletions), Next.js 16 breaking-changes agent rule, Pre-push checks (typecheck, lint, test, check:perms, e2e), CLAUDE.md (working on FloorTest), Owner's twelve working principles, 10. Feature Development, Definition of done (+1 more)

### Community 90 - "Public Submit Route"
Cohesion: 0.19
Nodes (11): bad(), POST(), runtime, Queryable, userByHandle(), startUpload(), SubmissionMeta, AI_USE (+3 more)

### Community 91 - "Implementation Plan"
Cohesion: 0.18
Nodes (13): Capacitor 8 mobile shell, Resend email + webhook, Offline kept tracks (apps), 06 Implementation plan, Dead-code decision pass (Keep/Remove/Reconnect), Idempotent mutations, Label add-ons (Roster, Artist desks), Mobile app plan (+5 more)

### Community 92 - "Release Evidence Reports"
Cohesion: 0.14
Nodes (12): HTTP-only session cookie auth (currentUser / requireUser), Shared collections with teammates and votes (Team), Evidence: Beta scope 15 Oct 2026 (774b06a), Beta feature switches off (more_collections, send_music, referrals, plan_requests, teams), Evidence: two-step sign-in for team owners (28b9d5b), Team owners need two-step sign-in to manage team, Evidence: Password hardening 15 Oct 2026 (01630c4), Have I Been Pwned leaked-password check (k-anonymity, fails open) (+4 more)

### Community 93 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @electric-sql/pglite, music-metadata, next, postgres, react (+6 more)

### Community 94 - "Audio File Validation"
Cohesion: 0.16
Nodes (7): BITRATES_V1_L3, BITRATES_V2_L3, findFrames(), frameLength(), mp3TailOk(), RATES, Reader

### Community 96 - "Data & Permissions Docs"
Cohesion: 0.15
Nodes (11): Collection share links (switch sharing), Ops permission check script, 05 Data: where it lives, account_members / account_invites, collection_links tables (held), Migrations (src/lib/db/migrations.ts), Ops permissions (src/lib/ops-perms.ts), storage_deletions queue (+3 more)

### Community 97 - "Rollout Brief & Visuals"
Cohesion: 0.17
Nodes (13): The Booth at 2am visual direction, docs/brand-voice.md, Rollout brief, Home hero: CDJ jog wheel with crest, Public copy, Public send page /<handle>, Rollout book README, FloorTest Rollout Book artifact (+5 more)

### Community 99 - "npm Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, check:perms, db:migrate, dev, e2e, lint, seed (+5 more)

### Community 100 - "Offline Save (Web)"
Cohesion: 0.32
Nodes (11): OfflineSave(), turnOff(), turnOn(), clearOffline(), Crate, Handle, offlineAvailable(), offlineStatus (+3 more)

### Community 101 - "Security Policy"
Cohesion: 0.17
Nodes (3): currentUser() returns the desk, FloorTest Security Policy, Threat model and trust boundaries

### Community 102 - "Pentest Brief & Retired"
Cohesion: 0.21
Nodes (12): Vercel Firewall rules, Capability tokens, External penetration test brief, Private audio access, SECURITY.md invariants, Collection share links, Team roles, Tenant isolation (+4 more)

### Community 103 - "iOS Share Inbox"
Cohesion: 0.27
Nodes (3): Entry, ShareInbox, .folder

### Community 104 - "Dev Dependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, tsx, @types/node (+4 more)

### Community 105 - "Storage Audit"
Cohesion: 0.29
Nodes (10): cost(), gb(), Storage(), GET(), runtime, AUDIT_BUCKETS, checkBucket(), expectedFiles() (+2 more)

### Community 106 - "Sender Codes"
Cohesion: 0.38
Nodes (9): bad(), GET(), POST(), canResend(), checkCode(), CodeError, confirmedEmail(), sendCode() (+1 more)

### Community 107 - "Root Layout & Tap Speed"
Cohesion: 0.24
Nodes (8): metadata, RootLayout(), viewport, Cap, NativeApp(), Kind, label(), TapSpeed()

### Community 109 - "Social Links"
Cohesion: 0.33
Nodes (9): BY_NAME, MAX_LINKS, parseLink(), parseLinks(), PlatformKey, PLATFORMS, ProfileLink, senderProfiles() (+1 more)

### Community 110 - "iOS App Imports"
Cohesion: 0.24
Nodes (5): AVFoundation, Capacitor, Foundation, UIKit, UniformTypeIdentifiers

### Community 111 - "Brand & Sales"
Cohesion: 0.20
Nodes (10): Brand and positioning, Honest signals (Listened = 30 s real playback), Key moment names (your link, desk, crate, callout, receipt), Receiving desk for new music positioning, Sales and partnerships, Five-step outreach sequence, Sender trust requirements, Team buyer personas (labels, radio, crews, agencies) (+2 more)

### Community 112 - "Desk Role Check Script"
Cohesion: 0.20
Nodes (9): api, dir, GUARD, Need, problems, ROLES, routeFiles(), ROUTES (+1 more)

### Community 113 - "Folder Send Uploads"
Cohesion: 0.31
Nodes (10): droppedFiles(), FolderSend(), sendAll(), upload(), releaseId(), backOnline(), putFile(), sendArtwork() (+2 more)

### Community 115 - "Notification Settings"
Cohesion: 0.39
Nodes (8): sendDigestNow(), updateNotifications(), hourLabel(), HourSelect(), MODES, NotificationsForm(), Prefs, browserTimeZone()

### Community 116 - "Scanner & Uptime Docs"
Cohesion: 0.29
Nodes (8): Trust & security page /trust, UptimeRobot monitoring, ClamAV virus scanner service, Cloudflare Containers host (Worker front), FloorTest virus scanner README, EICAR test verification, Fail-closed scanning with Retry-After retries, Fly.io fallback host

### Community 117 - "Session Management"
Cohesion: 0.32
Nodes (6): endSession(), SessionRow, TOUCH_EVERY_MS, touchSession(), WEB_IDLE_MS, setup()

### Community 118 - "Working Council & Release"
Cohesion: 0.29
Nodes (7): Release and rollback process, The working council, Evidence reports in docs/evidence/, Standing rules (mobile-next preview, ship to main), Owner's twelve working principles, UI freeze from 16 Oct, Working council (7 voices)

### Community 119 - "Revenue Model"
Cohesion: 0.29
Nodes (7): Beta promise (6 months free, then 50% for 12), costs.md, Revenue model, Paddle fees (5% + $0.50), Paid share as revenue lever, Plans: Free 20 / Pro $6.99 / Team $19.99, Launch decisions 12 Oct

### Community 120 - "Android Asset Script"
Cohesion: 0.29
Nodes (5): artOnly, crest, dens, ink, sharp

### Community 121 - "Bucket Copy Script"
Cohesion: 0.33
Nodes (4): askHidden(), dryRun, [from, to], main()

### Community 122 - "Scanner Package"
Cohesion: 0.29
Nodes (6): dependencies, @aws-sdk/client-s3, @aws-sdk/client-s3, name, private, type

### Community 123 - "Stress Test Script"
Cohesion: 0.43
Nodes (6): [base = "http://localhost:3000", handle = "invitee"], check(), ip(), main(), post(), results

### Community 124 - "Admin Security Page"
Cohesion: 0.38
Nodes (6): LIMITS, metadata, Security(), Table(), time(), Top

### Community 125 - "Admin Usage Page"
Cohesion: 0.33
Nodes (6): isoDay(), metadata, Row, Usage(), FEATURES_USED, FeatureUsed

### Community 126 - "Live Pulse"
Cohesion: 0.48
Nodes (4): GET(), GET(), deskPulse(), receiptPulse()

### Community 127 - "Transfer Screen"
Cohesion: 0.38
Nodes (6): audio(), choose(), timeLeft(), TransferFile, TransferScreen(), fmtBytes()

### Community 128 - "Store Listing"
Cohesion: 0.33
Nodes (6): Capacitor SPM dependency host, CapApp-SPM package README, App privacy nutrition label, App Store and Google Play listing, Apple IAP / Google Play Billing, iOS share extension app.floortest.share

### Community 129 - "Admin Feedback"
Cohesion: 0.40
Nodes (5): Feedback(), metadata, Row, STATUSES, TYPES

### Community 130 - "Admin Speed"
Cohesion: 0.40
Nodes (5): fmt(), Kind, KINDS, metadata, Speed()

### Community 131 - "Mobile Start Page Script"
Cohesion: 0.40
Nodes (4): crest, html, page, site

### Community 134 - "Vercel Config"
Cohesion: 0.50
Nodes (3): crons, regions, $schema

## Ambiguous Edges - Review These
- `/api/v1 mobile app API` → `Future public API (/api/v1, scoped developer keys)`  [AMBIGUOUS]
  docs/5. API.md · relation: conceptually_related_to
- `Paddle fees (5% + $0.50)` → `Apple IAP / Google Play Billing`  [AMBIGUOUS]
  mobile/store-listing.md · relation: conceptually_related_to

## Knowledge Gaps
- **130 isolated node(s):** `AVFoundation`, `.folder`, `.manifestURL`, `.routed`, `.folder` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 799 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Dashboard Collections & Config` to `Collection Share Links`, `Admin Feedback`, `Admin Accounts & Actions`, `Track Upload Completion`, `Review, Listened & Download`, `Admin UI & Feature Switches`, `App API Sessions (/api/v1)`, `Storage & Signed Audio`, `Decisions & Reply Templates`, `Player & Up Next`, `Sign-up & Password Auth`, `Email Webhooks & Incidents`, `Email Confirm & Contact`, `Team Comments & Shortlist`, `Desk, Notifications & Public Page`, `Plans & Plan Preview`, `Intake Uploads`, `Site Editor & Claim Box`, `Backups & Restore Drill`, `Auth Forms & Site Gate UI`, `Cron Jobs & Notify`, `Google Sign-in`, `Ops Permissions`, `Queue List & Filters`, `Sender Upload Metadata`, `Login Route & Human Check`, `Admin Overview & Allowance`, `Activity & Audit Log`, `QR, Waitlist & Monitoring`, `Auth Layout & Sidebar`, `Link Card & Account Page`, `Admin Audience & Announcements`, `Admin Metrics & Revenue`, `Settings & Public Page Form`, `Ops Sessions & View-as`, `Sender Receipt`, `Package & Lint Config`, `Login & Signup Pages`, `Proxy & Site Gate`, `Desk Bar & Feedback`, `Collection Forms & Cards`, `Site Content Editing`, `Folder Send & Choices`, `Email Copy Editor`, `Admin Navigation`, `Played Out Prompt`, `Sent History & Reopen`, `Unsubscribe (RFC 8058)`, `QR Dialog & Search`, `Admin Layout & Theme`, `Draft Preview`, `Forgot Password Flow`, `Public Submit Route`, `Storage Audit`, `Sender Codes`, `Root Layout & Tap Speed`, `Admin Security Page`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **What connects `AVFoundation`, `.folder`, `.manifestURL` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Collection Share Links` be split into smaller, more focused modules?**
  _Cohesion score 0.05175202156334232 - nodes in this community are weakly interconnected._
- **Why does `now()` connect `Admin Accounts & Actions` to `Collection Share Links`, `Track Upload Completion`, `Admin Speed`, `Review, Listened & Download`, `Dashboard Collections & Config`, `App API Sessions (/api/v1)`, `Storage & Signed Audio`, `Sign-up & Password Auth`, `Email Webhooks & Incidents`, `Email Confirm & Contact`, `Team Comments & Shortlist`, `Node Test Harness`, `Desk, Notifications & Public Page`, `Plans & Plan Preview`, `Intake Uploads`, `Backups & Restore Drill`, `Auth Forms & Site Gate UI`, `Cron Jobs & Notify`, `Ops Permissions`, `Login Route & Human Check`, `Admin Overview & Allowance`, `Deletion Queue & Retention`, `Activity & Audit Log`, `QR, Waitlist & Monitoring`, `Auth Layout & Sidebar`, `Link Card & Account Page`, `Two-step Sign-in (TOTP)`, `Admin Audience & Announcements`, `Admin Metrics & Revenue`, `Ops Sessions & View-as`, `Scanner Server (ClamAV)`, `Desk Bar & Feedback`, `Collection Forms & Cards`, `Site Content Editing`, `Email Copy Editor`, `Forgot Password Flow`, `Public Submit Route`, `Storage Audit`, `Sender Codes`, `Notification Settings`, `Session Management`, `Admin Security Page`, `Admin Usage Page`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Should `Track Upload Completion` be split into smaller, more focused modules?**
  _Cohesion score 0.06265389876880985 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `/api/v1 mobile app API` and `Future public API (/api/v1, scoped developer keys)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Paddle fees (5% + $0.50)` and `Apple IAP / Google Play Billing`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
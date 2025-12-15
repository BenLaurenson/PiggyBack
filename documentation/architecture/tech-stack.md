# Tech Stack

A complete reference of every technology, library, and service used in the PiggyBack application.

---

## Frontend

### Framework and Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.0.10 | App Router, Server Components, Server Actions, API Routes |
| React | 19.2.1 | UI rendering (Server and Client Components) |
| TypeScript | 5.x | Static type checking across the entire codebase |

### Styling

| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | 4.x | Utility-first CSS with custom design tokens |
| `@tailwindcss/postcss` | 4.x | PostCSS integration for Tailwind |
| `tw-animate-css` | 1.4.0 | Tailwind-compatible CSS animation utilities |
| `class-variance-authority` | 0.7.1 | Variant-based component styling (used by shadcn/ui) |
| `clsx` | 2.1.1 | Conditional className composition |
| `tailwind-merge` | 3.4.0 | Intelligent Tailwind class merging (resolves conflicts) |

### UI Components (shadcn/ui + Radix)

| Package | Purpose |
|---------|---------|
| `shadcn` (dev) | CLI for adding/updating shadcn/ui components |
| `@radix-ui/react-alert-dialog` | Confirmation dialogs |
| `@radix-ui/react-avatar` | User avatars |
| `@radix-ui/react-checkbox` | Checkbox inputs |
| `@radix-ui/react-collapsible` | Collapsible sections |
| `@radix-ui/react-dialog` | Modal dialogs |
| `@radix-ui/react-dropdown-menu` | Dropdown menus |
| `@radix-ui/react-label` | Form labels |
| `@radix-ui/react-popover` | Popover panels |
| `@radix-ui/react-progress` | Progress bars |
| `@radix-ui/react-scroll-area` | Custom scrollable areas |
| `@radix-ui/react-select` | Select dropdowns |
| `@radix-ui/react-separator` | Visual separators |
| `@radix-ui/react-slider` | Range slider inputs |
| `@radix-ui/react-slot` | Polymorphic component slots |
| `@radix-ui/react-switch` | Toggle switches |
| `@radix-ui/react-tabs` | Tabbed navigation |
| `@radix-ui/react-visually-hidden` | Accessible visually hidden content |

### Charts and Visualization

| Technology | Version | Purpose |
|------------|---------|---------|
| Recharts | 2.15.4 | Line, bar, area, and pie charts for financial data |

### Animation

| Technology | Version | Purpose |
|------------|---------|---------|
| Framer Motion / Motion | 12.23.26 | Page transitions, component animations, gesture handling |

### Icons

| Technology | Version | Purpose |
|------------|---------|---------|
| Lucide React | 0.561.0 | Consistent icon set across the application |

### Toast Notifications

| Technology | Version | Purpose |
|------------|---------|---------|
| `goey-toast` | 0.2.0 | Animated toast notification system (Goey Toaster) |

### Validation

| Technology | Version | Purpose |
|------------|---------|---------|
| Zod | 4.1.13 | Schema validation (used for form validation and API input) |

### Drag and Drop

| Technology | Version | Purpose |
|------------|---------|---------|
| `@hello-pangea/dnd` | 18.0.1 | Drag-and-drop for budget layout reordering |

### Drawer / Sheet

| Technology | Version | Purpose |
|------------|---------|---------|
| Vaul | 1.1.2 | Mobile-friendly drawer component (used for bottom sheets) |

### Markdown

| Technology | Version | Purpose |
|------------|---------|---------|
| react-markdown | 10.1.0 | Render markdown content (AI chat responses) |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown support (tables, strikethrough, etc.) |

### Emoji

| Technology | Version | Purpose |
|------------|---------|---------|
| `@ferrucc-io/emoji-picker` | 0.0.48 | Emoji picker for expense/goal customization |

### Intersection Observer

| Technology | Version | Purpose |
|------------|---------|---------|
| react-intersection-observer | 10.0.0 | Lazy loading and scroll-triggered animations |

### Date Utilities

| Technology | Version | Purpose |
|------------|---------|---------|
| date-fns | 4.1.0 | Date formatting, comparison, and manipulation |

---

## Backend

### Database and Auth

| Technology | Purpose |
|------------|---------|
| Supabase | Managed PostgreSQL database, authentication, Row Level Security (RLS), real-time subscriptions |
| `@supabase/supabase-js` (2.87.1) | JavaScript client for Supabase queries and auth |
| `@supabase/ssr` (0.8.0) | Server-side rendering integration (cookie-based auth) |

### API Layer

| Technology | Purpose |
|------------|---------|
| Next.js API Routes | RESTful endpoints under `/api/` for client-side data fetching |
| Next.js Server Actions | Server-side mutations invoked directly from Client Components (form submissions, data updates) |

### AI Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| Vercel AI SDK (`ai`) | 6.0.77 | Streaming AI responses, tool calling, multi-step reasoning |
| `@ai-sdk/react` | 3.0.79 | React hooks for AI chat UI (`useChat`) |

---

## AI Providers (User-Configured)

Users choose their own AI provider and supply their own API key in Settings. The application supports three providers:

| Provider | SDK Package | Default Model |
|----------|-------------|---------------|
| Google Gemini | `@ai-sdk/google` (3.0.22) | `gemini-2.0-flash` |
| OpenAI GPT | `@ai-sdk/openai` (3.0.26) | `gpt-4o-mini` |
| Anthropic Claude | `@ai-sdk/anthropic` (3.0.39) | `claude-sonnet-4-5-20250929` |

The AI assistant (Piggy Chat) has access to 35 financial tools for reading and writing financial data, all enforced through Supabase RLS.

---

## External APIs

### UP Bank API

- **Type**: REST API (JSON:API specification)
- **Documentation**: https://developer.up.com.au/
- **Base URL**: `https://api.up.com.au/api/v1`
- **Authentication**: Personal access token (Bearer token)
- **Endpoints used**: Accounts, Transactions (paginated), Categories, Webhooks
- **Webhook events**: `TRANSACTION_CREATED`, `TRANSACTION_SETTLED`, `TRANSACTION_DELETED`, `PING`
- **Webhook security**: HMAC-SHA256 signature verification with timing-safe comparison

### Yahoo Finance

- **Type**: REST API (v8 chart endpoint)
- **Purpose**: Stock and ETF price data for the investment tracker
- **Authentication**: None required (free public API)

### CoinGecko

- **Type**: REST API
- **Purpose**: Cryptocurrency price data for the investment tracker
- **Authentication**: None required (free public API)

---

## Infrastructure

### Hosting

| Service | Purpose |
|---------|---------|
| Vercel | Application hosting, serverless functions, edge middleware |
| Supabase | Managed PostgreSQL (region: `ap-northeast-1`), authentication, RLS policies, storage |

### Analytics and Monitoring

| Technology | Version | Purpose |
|------------|---------|---------|
| `@vercel/analytics` | 1.6.1 | Page view and web analytics |
| `@vercel/speed-insights` | 1.3.1 | Core Web Vitals and performance monitoring |

### Real-Time Sync

| Mechanism | Purpose |
|-----------|---------|
| UP Bank Webhooks | Real-time transaction push from UP Bank to the application (also triggers goal balance syncing and net worth snapshots) |

---

## Dev Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 4.0.16 | Unit and integration testing |
| `@testing-library/react` | 16.3.1 | React component testing utilities |
| `@playwright/test` | 1.58.2 | End-to-end browser testing |
| `@playwright/experimental-ct-react` | 1.58.2 | Playwright component testing for React |
| jsdom | 27.4.0 | DOM environment for Vitest |
| ESLint | 9.x | Code linting |
| `eslint-config-next` | 16.0.10 | Next.js-specific ESLint rules |
| TypeScript | 5.x | Static type checking |
| Knip | 5.85.0 | Dead code and dependency analysis |

---

## Type Definitions

| Package | Purpose |
|---------|---------|
| `@types/node` | Node.js type definitions |
| `@types/react` | React 19 type definitions |
| `@types/react-dom` | React DOM type definitions |

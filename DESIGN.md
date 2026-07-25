# Design System: CHENLOOP — Credit & Capital Command Center
**System Specification:** Stitch Semantic Design System (v3.0)

## 1. Visual Theme & Atmosphere
* **Mood & Atmosphere:** Dense, Ultra-Precise, High-Tech Financial Command Center.
* **Aesthetic Philosophy:** *Dark Luxury & Financial Integrity*. Uses low-saturation obsidian backgrounds contrasted against glowing emerald metrics and crisp indigo indicators to convey absolute transparency, security, and capital control.
* **Density:** Controlled high-density layout optimized for financial monitoring, cards with high-contrast borders and subtle translucent glassmorphism.

## 2. Color Palette & Functional Roles
* **Deep Obsidian (#080C14):** Primary canvas background. Conveys depth, focus, and security.
* **Midnight Surface (#0F172A):** Elevated card containers and side navigation. Provides clear structural hierarchy.
* **Emerald Glow (#10B981):** Primary financial accent. Used for positive cash flows, available capital, high credit scores, and primary action buttons.
* **Emerald Dark Gradient (#047857):** Linear gradient fill for high-impact call-to-action buttons (`#10B981` to `#047857`).
* **Indigo Reserve (#6366F1):** Secondary capital accent. Used exclusively for deployed capital (loans active) and portfolio indicators.
* **Crimson Warning (#F43F5E):** Alert accent. Used for PAR7/PAR30 delinquency spikes, broken promises, and rejected credit applications.
* **Amber Caution (#F59E0B):** Moderate risk indicator. Used for medium credit scores (65-79 pts), early delinquency (1-7 days), and reserve warnings.
* **Muted Slate Text (#94A3B8):** Secondary typography for table headers and labels.
* **Crisp Pure White (#F8FAFC):** Primary typography for high-legibility numerical values and titles.

## 3. Typography Rules
* **Display Font (Headers & Key Numbers):** `Outfit` (Google Fonts, weights 600/700). Applied to numerical stats, capital metrics, and primary section headers.
* **Body & Form Font:** `Plus Jakarta Sans` (Google Fonts, weights 400/500/600). High-legibility sans-serif for tables, labels, form controls, and logs.
* **Numerical Rhythm:** Monospaced tabular alignment for financial numbers and percentages ($10,000.00, 2.4%).

## 4. Component Stylings (Stitch Specifications)
* **Buttons:**
  * **Primary CTA:** Pill-shaped or subtle rounded corners (8px), vibrant Emerald Glow gradient with subtle outer glow (`box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3)`).
  * **Secondary Action:** Translucent slate background (`rgba(255, 255, 255, 0.08)`) with white text.
* **Cards & Containers:**
  * Generously rounded corners (16px border-radius).
  * 1px subtle border stroke (`rgba(255, 255, 255, 0.08)`).
  * Deep elevation shadow (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25)`).
* **Capital Hero Card (Signature Element):**
  * Asymmetric ambient backlight (`radial-gradient` glow in the top-right corner).
  * Segmented multi-color progress bar showing deployed vs. available vs. reserve capital ratio.
* **Status Badges:**
  * Pill-shaped badges (12px rounded-full) with translucent colored backgrounds (12% opacity) and high-contrast text.
* **Modals:**
  * Full-screen backdrop blur (`backdrop-filter: blur(8px)`), centered obsidian card container with emerald accent headers.

## 5. Layout Principles & Structure
* **Sidebar + Header Pattern:** 260px fixed sidebar for navigation with brand icon (`CL`) and organizational context tag.
* **Responsive Metric Grid:** Auto-fit CSS Grid with minimum card width of 220px.
* **Data Density:** High-craft tables with dark headers (`#162032`), hover state feedback (`rgba(255,255,255,0.02)`), and clean row division.

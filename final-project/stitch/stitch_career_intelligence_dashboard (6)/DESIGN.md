---
name: Kinetic Enterprise Intelligence
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1280px
  gutter: 20px
---

## Brand & Style
The design system is engineered for high-density information environments within the enterprise SaaS sector. The brand personality is professional, authoritative, and clinical, prioritizing cognitive efficiency over decorative flair. 

The aesthetic follows a **Modern Minimalist** approach. It utilizes expansive white space not just for beauty, but as a functional separator for complex data sets. The emotional response should be one of "controlled clarity"—users should feel they are interacting with a high-performance tool that values their time and focus. There is a total absence of trend-driven effects like glassmorphism or heavy gradients; instead, the system relies on precision, strict alignment, and a systematic hierarchy to establish credibility.

## Colors
The palette is restricted to ensure maximum focus on content. 

- **Backgrounds:** The primary surface is `#F8FAFC` (Slate 50), providing a softer, more professional canvas than pure white.
- **Typography:** Primary text uses `#1E293B` (Slate 800) to ensure high contrast and readability while avoiding the harshness of pure black.
- **Accents:** `#4F46E5` (Indigo 600) is reserved strictly for primary actions, progress indicators, and active states.
- **Status Indicators:** A semantic set is used for career matching: Success (Matched), Warning (Partial), and Error (Missing). These should be used sparingly in small badges or thin indicators.

## Typography
The design system utilizes **Inter** for its systematic, utilitarian qualities and exceptional legibility at small sizes. 

- **Hierarchy:** Use weight (Medium to Bold) rather than size to distinguish information layers in dense views.
- **Labels:** Small caps and increased letter spacing are used for metadata and table headers to distinguish them from actionable body text.
- **Numerical Data:** For data tables and progress metrics, ensure `font-variant-numeric: tabular-nums` is applied to maintain vertical alignment in lists.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for desktop to maintain structural integrity, transitioning to a fluid model for mobile.

- **Grid:** A 12-column grid with a 1280px max-width is standard. 
- **Rhythm:** A strict 4px baseline grid ensures vertical consistency. Spacing between related items (like a label and an input) should be 4px or 8px; spacing between distinct sections should be 24px or 32px.
- **Density:** This design system favors "Compact" density. Gutters are kept at 20px to allow for high horizontal information density without crowding.

## Elevation & Depth
In line with the minimal and credible aesthetic, depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Flat Surface:** The main canvas is `#F8FAFC`.
- **Raised Surface (Cards/Modals):** Elements sit on a pure `#FFFFFF` background.
- **Borders:** Instead of shadows, use 1px solid borders in `#E2E8F0` (Slate 200) to define boundaries.
- **Active State Elevation:** Only use a subtle, highly diffused shadow (0px 4px 6px -1px rgba(0, 0, 0, 0.05)) for hovering over interactive cards to provide immediate tactile feedback.

## Shapes
The shape language is **Soft** and restrained. 

- **Standard Elements:** Buttons, inputs, and cards use a `0.25rem` (4px) radius. This provides a modern feel while maintaining the serious, structured look required for enterprise software.
- **Badges/Chips:** Use a fully rounded pill shape (9999px) for status indicators to visually differentiate them from interactive buttons or structural cards.

## Components

### Buttons
- **Primary:** Solid Indigo background, White text. No gradients.
- **Secondary:** White background, Slate 200 border, Slate 800 text.
- **Ghost:** No background/border, Indigo text. Used for secondary actions in tables.

### Status Badges
- Used for "Matched", "Partial", and "Missing".
- Construction: Subdued background (10% opacity of the semantic color) with high-contrast bold text of the same hue.

### Cards (Career Intelligence)
- Compact layout with a 1px Slate 200 border.
- Header uses `label-md` for categories.
- Progress indicators (linear bars) should be 4px tall with an Indigo 600 fill and Slate 100 track.

### Input Fields
- 1px Slate 300 border. On focus, the border changes to Indigo 600 with a 2px outer glow (Indigo 600 at 10% opacity).
- Labels are always visible above the field using `label-sm`.

### Data Tables
- Row height: 48px for compact density.
- Zebra striping is not used; use subtle 1px bottom borders in Slate 100 to separate entries.
- Hover state for rows: Slate 50 background.

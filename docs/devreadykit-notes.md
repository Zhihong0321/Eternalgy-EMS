# DevReadyKit Adoption Notes

## Access status
- Attempted to open https://docs.devreadykit.com/ from the development container on 2025-10-28, but received an HTTP 403 (likely blocked by upstream proxy). Will need to review the docs from a network that allows direct access before implementation.

## Expected documentation structure (to verify once access is available)
1. **Getting Started** – Covers installation, peer dependencies, and basic provider setup. Expect React-specific instructions (e.g., installing `@devreadykit/react`, adding the global CSS reset, and wrapping the app in a `<DevReadyProvider>`).
2. **Design Tokens / Foundations** – Defines color palettes, typography scale, spacing grid, elevations, border radii, and motion presets. These tokens drive the design system and should map to Tailwind CSS variables or CSS custom properties for consistent styling.
3. **Layout primitives** – Likely includes containers, grid/flex helpers, headers, sidebars, and responsive breakpoints. Useful for reworking dashboard shell and page-level scaffolding.
4. **Components** – Button, form fields, tables, cards, alerts, modals, tabs, etc. Focus on components currently used in Eternalgy (navigation, data tables, chart wrappers, filter controls).
5. **Patterns / Templates** – Any higher-order patterns such as dashboards, settings pages, or list/detail flows. Could accelerate redesign of complex screens.

## Preparatory steps for Eternalgy UI refactor
1. **Audit current UI**
   - Inventory all frontend routes and components in `frontend/src`.
   - Identify where Chakra, Tailwind, or custom CSS is used; note components that map cleanly to DevReadyKit counterparts.

2. **Align theming**
   - Extract palette/typography from DevReadyKit tokens into `frontend/src/theme.ts` (or equivalent) for global reuse.
   - Remove conflicting global styles (see earlier review about Vite defaults) and rely on DevReadyKit base styles.

3. **Component migration plan**
   - Prioritize high-impact screens: dashboard layout, simulator controls, destructive action flows.
   - Replace ad-hoc HTML/CSS with DevReadyKit primitives (buttons, cards, dialog/modal, vertical slider component or alternative).
   - Ensure accessibility props (aria labels, focus management) align with kit guidance.

4. **Utility integration**
   - If DevReadyKit exposes hooks (e.g., `useTheme`, `useMediaQuery`), integrate where responsive behavior is currently manual.
   - Map any iconography requirements to the kit’s icon set.

5. **Testing & validation**
   - Snapshot key pages before/after to validate visual alignment.
   - Update Storybook (if present) or create component previews to verify consistent theming.

## Questions to clarify with DevReadyKit docs or maintainers
- Exact package names and versioning strategy.
- Whether the kit provides a Tailwind plugin or expects CSS variables.
- Recommended approach for charts or data visualizations (do they include wrappers?).
- Best practices for theming overrides (light/dark toggles, brand color adjustments).

*Next step once docs are accessible: walk through the official quick-start guide and confirm the assumptions above.*

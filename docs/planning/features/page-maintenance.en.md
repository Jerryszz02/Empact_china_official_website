# Page Maintenance Guide

[中文](page-maintenance.md) | English

This guide describes the repository implementation and ongoing maintenance requirements. Public content follows the published CMS snapshot; this document does not record a “currently live” commit. For operational steps, see the [CMS user guide](../content/cms-guide.en.md). For facts and image attribution, see the [Source index](../content/sources.md) (Chinese).

## Homepage and branding

- The page entry point is `apps/site/src/pages/index.astro`; motion is in `lib/home-motion.ts` and `lib/home-paging.ts`; the photo strip is in `components/HomePhotoGallery.astro` and `lib/home-gallery.ts`.
- The four screens are, in order: brand and photo strip, who we are, four business groups, and inquiry. Their backgrounds are dark blue, light, light, and dark blue. The later tetrahedron demo was not adopted and does not define a redesign direction.
- Brand blue is `#125284`, red is `#FB394D`, and teal is `#2CB3B9`, based on the [User-provided color reference](../../../assets/品牌与设计/motion-brand-reference.png). Off-white `#F3F0E7` is an additional color from the approved sample; white is `#FFFFFF`. Use the actual Empact logo and system Chinese fonts. Spacing, breakpoints, and timing follow the code.
- Logo particles gather, restore the brand colors, then move upward and shrink to reveal the photo strip. Early scrolling transitions smoothly; returning to the top does not replay the opening. Navigation remains available throughout.
- Desktop mouse-wheel scrolling pages between the actual scene anchors. Mobile, reduced motion, short landscape viewports, enlarged text, and overflowing content use natural scrolling. The footer and focus targets must remain reachable. Static logo, text, and links remain available if JavaScript, Canvas, or images fail.
- Photos support plain photo and filmstrip styles, dragging, touch, horizontal trackpad gestures, and arrow keys. Playback resumes from the current position on release; hovering does not pause it. Computation stops when off-screen or when the page is hidden. Reduced motion allows static browsing.
- The `home-gallery` Global is saved, previewed, and published independently. An empty published gallery does not show placeholder photos. Older snapshots without this field remain readable.

After changes, check `tests/browser/motion.spec.ts` and `tests/browser/home-gallery.spec.ts`, covering scrolling in both directions, early scrolling, empty/single/multiple images, playback after dragging, reduced motion, and fallbacks. Separately verify behavior on real iOS Safari, Android, and low-end devices.

## Business offerings, case studies, and the talent model

The four group overview pages read published content. Business order is maintained within each group, with the talent model fixed first. Case studies are sorted by `publishedAt` in descending order. Event date, schedule description, and location are stored separately; do not treat the publication date as the event date. Links at the top and bottom of a case study return to its actual parent business, or to its business group if the parent is missing.

The talent model is at `/youth/international-talent-model/`; the old `/youth/development-model/` redirects there. It is implemented in `components/YouthDevelopmentModel.astro` and the corresponding page. Preserve attribution to 开物 KAIWU, the original names of the six dimensions, the five traits, and the five-step development process. Do not claim an in-house model or verified outcomes. This fixed model neither accepts case studies nor supports CMS editing. Design structured fields separately if operational editing is needed.

After changes, check `tests/site-output.test.ts`, `tests/browser/youth-model.spec.ts`, output links and metadata, and the absence of horizontal overflow from mobile to desktop.

## About page

`packages/content/src/about.ts` supplies preview content and the initial import; the actual body comes from the snapshot. The page and parser are `apps/site/src/pages/about.astro` and `lib/about.ts`, with styles in `styles/about.css`. Do not directly overwrite an edited CMS body.

The template's second-level headings are, in order: opening screen, key figures, who we are, China business, impact, history, awards, team, and inquiry. The opening screen is rendered as the page's only h1. Third-level headings organize cards; blockquotes retain the boundaries of the business scope. The inquiry section shows only the cooperation entry; email and address are kept together in the footer.

The page displays founders before awards while preserving the CMS template order. Portraits for Peter Yang and Maggie 杨祯慧 are stored in `apps/site/src/assets/founders/`, matched by name, and optimized by Astro. Other members retain their initials as placeholders.

Award cards retain “year as a third-level heading + name paragraph + description paragraph,” with optional additional explanations and image captions. Older two-paragraph cards remain compatible. Unfamiliar or incomplete structures display the full ordinary body rather than dropping content. When changing section structures, update the parser together with `tests/about-parser.test.ts` and `tests/browser/about.spec.ts`.

Award media is defined in `packages/content/src/about-awards.ts`. The source index records the basis for 12 Asia-Pacific locations, entry into China in 2023, and award attribution. For targeted draft tools, see [CMS content maintenance](../content/business-content-migration.md#定向文案工具) (Chinese).

## Inquiries and recruitment

The inquiry page `/contact/` uses business options from the snapshot. Inquiry category, name, one contact method, request details, and privacy consent are required; other fields are optional. Attachments are not accepted. Switching business groups clears the selected sub-business. Preserve old links using `?business=<业务 ID>`, group values, and `other`; `<业务 ID>` is the business ID placeholder.

`POST /api/contact` remains compatible with older requests. New forms containing `segment` validate the name and sub-business, and limit field lengths, reference links, and request size. The fields actually delivered are included in the idempotency digest. Failure preserves input and the submission identifier; success disables repeat submission. Automated tests use mock delivery and do not prove receipt by a real inbox.

Recruitment pages `/join-us/` and `/join-us/apply/?job=<ID>` read published openings. New CMS environments start with no openings. New openings default to real positions; verify historical examples before clearing their flag. After closing or deleting and publishing an opening, even old forms cannot submit for the invalid position. With no real open positions, the website shows “There are currently no open positions” (目前暂无开放岗位).

Applications collect the position, name, email, optional phone/WeChat, experience, availability, and at least one HTTP(S) résumé or portfolio link. Attachments are not accepted. Applications reuse the inquiry endpoint and SMTP configuration. Inquiries and recruitment read their respective email addresses from the admin's “Recipient settings” (收件设置). Before settings are saved, both use `enquiries@empact.asia`; saving takes effect immediately for subsequent submissions. `company.email` is only the public contact address. Real sending is disabled in previews.

Office photos are published independently through the `office-gallery` Global. Default photos remain when no custom gallery is configured. The first custom publication replaces the default list; publishing an empty list hides the section. A caption is required, with a maximum of 200 characters. One or two photos are displayed statically; photos extending beyond the area can be browsed horizontally, without automatic playback. Older snapshots remain compatible.

Relevant checks: `tests/contact.test.ts`, `tests/public-server.test.ts`, `tests/browser/contact.spec.ts`, `tests/browser/recruitment.spec.ts`, and `tests/cms-live.ts`. CMS field changes also require checking the [Deployment schema plan](../operations/automatic-deployment.md) (Chinese).

## Privacy, terms, and SEO

Chinese URLs are `/privacy/` and `/terms/`; English URLs are `/en/privacy/` and `/en/terms/`. Their CMS slugs are `privacy`, `terms`, `privacy-en`, and `terms-en`. All four documents can be edited, approved, and published independently. If an English record is unpublished, its entry is hidden and its page is not built. Code deployment does not overwrite existing CMS bodies; `packages/content/src/legal.ts` only supplies approved default content.

`LegalPage.astro` handles language links, document language, and the recruitment privacy anchor. Language switching uses ordinary links and requires no JavaScript, Cookies, or local storage. Navigation and the footer remain in Chinese with language annotations; English body content preserves the company's Chinese registered name. The new version includes recruitment notices in the personal information list; older snapshots retain the original supplemental notice. The privacy contact email is `maggie.yang@empact.sg`, and information is stored within China. When making changes, check the actual operating entity and processing workflow. See the [Source index](../content/sources.md#法律页面) (Chinese) for the basis of the text.

For targeted synchronization in the destination environment, see [CMS content maintenance](../content/business-content-migration.md#法律页面定向同步) (Chinese). Manual changes must also affect only the target records. After approval and publication, verify the Chinese and English bodies, language links, and footer. Programmatic imports use `htmlToLexical()` to retain rich-text structure; do not paste HTML as plain text. Historical inquiry migration uses the frozen old policy rather than rewriting the new body.

Current forms do not accept attachments. SMTP acceptance does not mean the recipient has read the message, and `retentionDays` does not implement automatic email deletion. When adding analytics, payments, registration, or similar features, review both the notices and the actual processing workflow; do not copy old wording without checking it.

`BaseLayout.astro` outputs the Organization `@id`; article publishers reference the same entity. Structured data must match the visible approved body. Do not invent unknown phone numbers or founding years, automatically use the Singapore website as sameAs, or generate events, reviews, or bulk location pages without factual support.

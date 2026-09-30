# CMS User Guide

[中文](cms-guide.md) | English

> For colleagues who update website content. No programming knowledge is required; follow the steps below. Chinese labels are retained alongside their English translations so you can find the matching controls in the admin interface.

## Three rules to remember

1. **Saving is not publishing.** “Save” (保存) only saves a draft; the website changes after you click “Publish to website” (发布到官网).
2. **Each publication affects only the selected item.** Publishing one case study does not publish other drafts.
3. **A failed publication keeps or restores the previous version.** The website stays on its previous version. Send a screenshot of the failure message to the technical maintainer.

## Sign in

1. Open https://empact.cn/admin/ or click “Admin” (后台管理) in the website footer.
2. Enter your username or email address and password. The technical maintainer creates accounts and can reset forgotten passwords.
3. After signing in, you arrive at the “Businesses and case studies” (业务与案例) dashboard.

Main admin entries:

| Entry                                      | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Add project (新增项目)                     | Add a case study or project                                                |
| Manage published projects (管理已发布项目) | View, edit, or unpublish live content                                      |
| Manage drafts (管理草稿)                   | Continue editing unpublished content                                       |
| Add business type (新增业务类型)           | Add business offerings, maintain their descriptions, or change their order |
| Homepage photos (首页照片)                 | Maintain the photo strip on the first screen of the homepage               |
| Recruitment management (招聘管理)          | Publish, edit, or close job openings                                       |
| Office photos (办公空间照片)               | Maintain office photos on the “Join us” page                               |
| Recipient settings (收件设置)              | Set separate recipient email addresses for inquiries and job applications  |

## Add a case study (the most common task)

1. Open “Add project” (新增项目), then click “Add project” (新增项目).
2. Enter the **Name** (名称) and **Short description** (简短介绍), and select the **Business type** (所属业务类型), such as “公益社创体验” (Community service and social innovation experiences). The case study will appear on that business page. Click “Create and edit” (创建并编辑).
3. Three fields are optional; leave them blank if you do not have reliable information:
   - **Event date** (活动日期): the date the event took place, for example `2026-09-23`. This is the event date, not the article publication date.
   - **Schedule description** (活动时间说明): for multi-day events or ongoing schedules, such as “September 23–25,” “Ongoing,” or “Every Saturday.”
   - **Location** (地点): where the event took place.
4. Set the **Project cover** (项目封面): choose an image from the media library or upload one. Use JPG, PNG, or WebP, no larger than 5 MB per image. Add **Alternative text** (替代文字), a sentence describing the image. Prefer photos with confirmed permission for public use that belong to this event.
5. Choose **one of two** detail formats:
   - Existing WeChat Official Account article → fill in the **External detail link** (详情外链). Clicking the card takes readers directly to that URL.
   - Article on the website → leave the external link blank and write the content and insert images in **Page body** (网页正文).
   - The optional “Source name” (来源名称) and “Source link” (来源链接) fields attribute an on-site article; they do not change where the card links.
6. Click **Save draft** (保存草稿), then **Preview draft** (预览草稿). Check the title, summary, cover, business type, date, location, and body. Preview links require login and expire after one hour.
7. When everything is correct, click **Publish to website** (发布到官网), confirm in the dialog, and wait for the publication result. The case study's business type must have been published first.
8. Open the corresponding business page on the public website. Confirm that the new card appears and its date and location are correct. For an on-site article, also open and check the detail page.

## Edit published content

Open “Manage published projects” (管理已发布项目), find the project, edit and save it, then click **Publish update** (发布更新). Saving without publishing leaves the public website unchanged; the item shows “Unpublished changes” (有未发布修改).

## Unpublish or delete

- **Unpublish** (撤下): removes content from the website but retains it under “Manage drafts” (管理草稿) so it can be published again later. You can also move a project to another business type.
- **Delete** (删除): unpublishes and deletes the record. **A business type with case studies under it cannot be deleted**; handle those case studies first. Historical versions and images referenced by them are retained for recovery.

## Add a business type or change the order

1. Open “Add business type” (新增业务类型). Assign the new offering to one of four groups: Corporate, Youth, School, or Community. You can also edit existing business names and descriptions here.
2. The board displays offerings by group. Drag a card's handle or use the up/down arrows to reorder it within its group. **Cards cannot be dragged between groups.** “International Talent Development Model” (国际人才培养模型) is fixed at the top of the Youth group and is excluded from sorting.
3. Order changes are saved automatically as drafts. The public order changes only after you **publish** each business showing “Unpublished changes” (有未发布修改).
4. If a message says someone else has changed the order, refresh the page and try again to avoid overwriting a colleague's changes.

## Homepage photos

1. Open “Homepage photos” (首页照片).
2. Choose **Photos** (纯照片) or **Filmstrip** (胶卷). Only the appearance differs; the content is the same.
3. Add images, drag to reorder, optionally add descriptions, and save.
4. Click **Generate preview** (生成预览), open it to check the result, then click **Publish preview version** (发布预览版本).
5. Publishing homepage photos updates only those photos; it does not include drafts from other sections.

## Job openings and office photos

**Job openings** (“Recruitment management” / 招聘管理): new environments start with no openings; existing environments keep their own records.

1. Enter the job title, type, location, summary, responsibilities, requirements, and availability expectations. Put each responsibility and requirement on its own line.
2. Use lowercase English letters, numbers, and hyphens for the **Job ID** (岗位 ID), such as `operation-intern`. Keep it stable after publication where possible.
3. Enter real recruitment information for new openings. If editing a historical example opening, verify the content before clearing the “Historical example opening” (历史示例岗位) flag. Examples appear only in previews, not on the public website, and do not accept applications.
4. Save → **Generate preview** (生成预览) → open and check the preview → **Publish preview version** (发布预览版本). Save and generate a new preview after every edit before publishing.
5. When recruitment ends, change the status to “Closed” (已关闭) or delete the opening, then preview and publish. The opening disappears from both the website and the application dropdown. Applications submitted from an old, already-open form will also be rejected.
6. When there are no real openings, the website automatically displays “There are currently no open positions” (目前暂无开放岗位).

**Office photos** (“Office photos” / 办公空间照片): add photo rows, choose or upload images, and enter the required **Caption** (图片说明), up to 200 characters. You can drag to reorder, replace, or remove photos. After saving, follow “Generate preview → Publish preview version” (生成预览 → 发布预览版本). Publishing after deleting all photos hides the “Where we work together” (一起工作的地方) section from the website.

## Images and the media library

- Only JPG, PNG, and WebP are supported, with a maximum of 5 MB per image. Every image needs alternative text.
- **Images referenced by drafts or published content cannot be deleted**, to prevent broken images on live pages.
- To replace an image: upload the new image → select it in the content → publish. Do not try to replace an image by deleting the old one.
- Use only photos with confirmed permission for public use. Ask if unsure; do not substitute photos from another event.

## Inquiry form and email recipients

Visitors submit inquiries at `/contact/`. Required fields are inquiry category, name, one contact method, request details, and consent to the privacy policy. After a successful submission, the system sends the content **by email** to the company's designated inbox. Job applications use the same email delivery channel.

- Failed submissions show a clear message; the system does not report a false success.
- Form availability depends on the published configuration and email sending configuration. If a visitor cannot submit, contact the technical maintainer and verify delivery to a real inbox.
- Administrators can open “Recipient settings” (收件设置) to change “Inquiry recipient email” (咨询收件邮箱) and “Recruitment recipient email” (招聘收件邮箱) separately. Both initially use `enquiries@empact.asia`. Saving takes effect for subsequent submissions without publishing a page or restarting services. It does not change the public email address displayed on the website. A successful save does not prove that a real email has arrived.

## Common questions

| Situation                                     | What to do                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Forgotten admin password                      | Ask the technical maintainer to reset it with the administrator command                                                     |
| Publication failed                            | Keep the failure message and send it to the maintainer to check the publication receipt and public website version          |
| Conflict message when saving                  | A colleague is editing the same item; refresh the page and repeat your edits                                                |
| Need to delete a business type                | Unpublish or move its case studies first, then delete the business type                                                     |
| Edited content has not changed on the website | You probably saved only a draft. Return to the item and click “Publish to website / Publish update” (发布到官网 / 发布更新) |

For technical troubleshooting, publication logs are stored on the server at `$RUNTIME_DIR/releases/<回执 ID>/build.log`, and draft preview logs at `$RUNTIME_DIR/build-logs/<预览 ID>.building.log`. Replace the Chinese placeholders with the receipt ID and preview ID respectively. These logs are accessible only on the server.

If you see “The website has been published, but admin status synchronization is incomplete” (官网已发布，但后台状态同步未完成), use “Retry status synchronization” (重试状态同步) to repair the admin status. Do not repeatedly publish. See [Operations and recovery](../operations/operations.md) (Chinese) for technical troubleshooting.

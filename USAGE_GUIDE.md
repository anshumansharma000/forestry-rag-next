# Forestry Intelligence System Usage Guide

This guide explains how app users and app admins use the Forestry Intelligence System. The app lets signed-in users ask questions over indexed PDF, DOCX, and TXT source documents, view cited excerpts, manage chat history, and update their account. Admins can also manage user accounts, and admins or knowledge managers can upload and index documents.

App URL: https://forestry-rag-next.pages.dev

## 1. Roles and Access

URL: https://forestry-rag-next.pages.dev

The app uses role-based access. Your role controls which pages and actions are available.

| Role | Main access |
| --- | --- |
| `viewer` | Sign in, use chat, view sources, manage own profile and password. |
| `officer` | Same app access as viewer, intended for operational users. |
| `knowledge_manager` | User access plus document upload, ingestion, and chunk preview. |
| `admin` | Full access, including user management and document ingestion. |

If you cannot see a page or action, your role probably does not allow it. Contact an admin if your access needs to change.

## 2. Sign In

URL: https://forestry-rag-next.pages.dev

1. Open https://forestry-rag-next.pages.dev in your browser.
2. Enter your email address and password.
3. Select **Sign in**.

If your account is marked as requiring a password change, the app will show the password change screen before you can continue.

## 3. First-Time Password Change

URL: https://forestry-rag-next.pages.dev

Some accounts are created with a temporary password. When this is required:

1. Enter your current temporary password.
2. Enter a new password.
3. Confirm the new password.
4. Select **Update password**.

Password rules:

- Use at least 8 characters.
- Include at least one uppercase letter.
- Include at least one lowercase letter.
- Include at least one number.
- Include at least one special character.

After the password is updated, the app stores the new session and lets you continue.

## 4. Main Chat

URL: https://forestry-rag-next.pages.dev

The main chat page is where users ask questions about indexed forestry documents.

### Start a Chat

1. Select **New Chat** in the sidebar, or type directly if no chat is open.
2. Enter a question in the prompt box.
3. Select the send button.

The assistant searches indexed sources and returns an answer with citations when relevant sources are found.

### Ask Effective Questions

Use clear, specific questions. Include names, document topics, laws, permits, species, locations, dates, or processes when known.

Examples:

- What documents mention forest permits for protected areas?
- Summarize the rules for habitat restoration approvals.
- Which source explains enforcement responsibilities?

### Top K Search Setting

The **Top K** value controls how many relevant source chunks the assistant asks the backend to retrieve for a response.

- Use a lower value such as `3` for focused answers.
- Use a higher value such as `8` or `10` when asking broad questions.
- The allowed range in the app is `1` to `20`.

### View Sources

Assistant answers may include source chips under the response. Each source chip shows:

- The source document name.
- Page or page range, when available.
- Retrieval relevance score.

Select a source chip to open the source excerpt drawer. The drawer shows the file name, page information, chunk number, score, and text excerpt used by the assistant.

### Delete a Message

Only user messages can be deleted from the chat screen.

1. Hover over or focus the message.
2. Select the delete icon.
3. Confirm the deletion.

Deleted messages are removed from the current chat history.

### Delete a Chat Session

1. Find the chat session in the sidebar.
2. Select the delete icon next to the session.
3. Confirm the deletion.

Deleting a chat session cannot be undone.

## 5. Profile

URL: https://forestry-rag-next.pages.dev/profile

All signed-in users can open **Profile** to view account details and change their password.

### Update Your Name

1. Open **Profile**.
2. Edit **Full name**.
3. Select **Save profile**.

Your email and role are shown for reference and cannot be changed from the profile page.

### Change Your Password

1. Open **Profile**.
2. Enter your current password.
3. Enter and confirm the new password.
4. Select **Update password**.

The new password must follow the password rules listed in section 3. The new password must also be different from the current password.

## 6. Document Upload and Ingestion

URL: https://forestry-rag-next.pages.dev/ingestion

This section applies to `admin` and `knowledge_manager` users.

The ingestion page lets authorized users upload documents, run indexing, and preview searchable chunks.

### Supported File Types

The app accepts:

- `.pdf`
- `.docx`
- `.txt`

Other file types are rejected.

### Upload a Document

1. Open **Ingestion** or **Upload & Ingest**.
2. Select **Upload document**.
3. Choose a supported file.
4. Wait for the upload confirmation.

Uploading a file does not automatically make it searchable. You must run ingest after uploading.

### Run Ingest

1. After uploading one or more documents, select **Run ingest**.
2. Wait while the job is queued or running.
3. Review the final status message.

When ingest succeeds, the app reports how many documents were indexed, how many were skipped because they already existed, and how many chunks were added.

### Refresh Chunk Preview

Select **Refresh preview** to reload the chunk preview list. The preview shows the first indexed chunks available to retrieval, including document name, page range, chunk number, and excerpt text.

If no chunks appear, upload documents and run ingest first.

## 7. Admin User Management

URL: https://forestry-rag-next.pages.dev/admin/users

This section applies only to `admin` users.

Open **Users** or go to the user management page to create accounts, update user details, disable access, change roles, and reset passwords.

### Create a User

1. Open **Users**.
2. Fill in **Email**.
3. Optionally fill in **Full name**.
4. Enter an initial password.
5. Choose a role.
6. Keep **Require password change** selected unless the user should keep the initial password.
7. Select **Create account**.

Recommended practice: require password change for all newly created users.

### Edit a User

1. Find the user in the user table.
2. Update email, name, role, or active status.
3. Select the save icon in that user's row.

Changes apply after the save action succeeds.

### Disable or Re-enable a User

1. Find the user in the user table.
2. Clear **Active** to disable access, or select **Active** to restore access.
3. Select the save icon.

Disabled users should not be able to continue using the app after their access is rejected by the backend.

### Reset a User Password

1. Find the user in the user table.
2. Select the key icon.
3. Enter the new password in the prompt.
4. Confirm the reset.

After an admin reset, the user is required to change the password at the next sign-in.

## 8. System Status and Setup Panel

URL: https://forestry-rag-next.pages.dev

The header shows whether required backend configuration appears ready.

- **Configured** means required configuration checks are passing.
- **Setup Needed** means one or more required configuration values are missing or invalid.

Select the settings icon to view backend and configuration status, including:

- Current user role.
- Supabase configuration status.
- Authentication/JWT status.
- Backend health.

Admins and knowledge managers can also open the ingestion page from this panel.

## 9. Sign Out

URL: https://forestry-rag-next.pages.dev

Select the sign-out icon in the header to end your current session. Sign out when using a shared device.

## 10. Common Problems

Primary URL: https://forestry-rag-next.pages.dev

Profile URL: https://forestry-rag-next.pages.dev/profile

Ingestion URL: https://forestry-rag-next.pages.dev/ingestion

User management URL: https://forestry-rag-next.pages.dev/admin/users

### I cannot sign in

Check that your email and password are correct. If the issue continues, ask an admin to confirm that your account exists and is active.

### I am asked to change my password

Your account requires a password update before use. Enter the current password you were given, then set a new password that satisfies all password rules.

### I cannot open ingestion

Only `admin` and `knowledge_manager` users can upload or ingest documents. Ask an admin to update your role if needed.

### I cannot open user management

Only `admin` users can manage accounts.

### The assistant gives weak or missing answers

Try a more specific question, increase **Top K**, or ask a knowledge manager/admin to confirm that relevant documents were uploaded and ingested.

### Uploaded documents do not appear in answers

Run ingest after upload, then refresh the chunk preview. If chunks still do not appear, check the ingest status message for skipped documents or errors.

### The app shows setup needed

The backend may be missing configuration such as Supabase, authentication, or model API settings. Ask the technical administrator to review the backend environment.

## 11. Good Practices

Primary URL: https://forestry-rag-next.pages.dev

Profile URL: https://forestry-rag-next.pages.dev/profile

Ingestion URL: https://forestry-rag-next.pages.dev/ingestion

User management URL: https://forestry-rag-next.pages.dev/admin/users

- Use specific questions instead of broad prompts.
- Check citations before relying on an answer.
- Do not upload duplicate or outdated source files unless they are intentionally replacing current guidance.
- Require password changes for temporary passwords.
- Disable inactive users instead of reusing their accounts.
- Sign out after using the app on a shared computer.

# Duplicates hard delete

## Goal

Allow deleting a duplicate member directly on Telegram via `deleteMessages`, bypassing soft-trash caption edits that can fail with `Message can't be edited`.

## Behavior

- Per-member delete-forever icon next to Keep.
- Confirm dialog, then `vault:deletePermanent([messageId])`.
- Remove member from local group list; drop group when fewer than 2 members remain.
- Soft-trash Keep flow unchanged.

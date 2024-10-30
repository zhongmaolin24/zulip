# Manage user groups

{!user-groups-intro.md!}

## Create a user group

!!! tip ""

    You can modify the group's name, description, and other settings after it
    has been created.

{!how-to-create-a-user-group.md!}

## Change a user group's name or description

{start_tabs}

{tab|desktop-web}

{relative|group|all}

1. Select a user group.

1. Select the **General** tab on the right.

1. Click the **pencil** (<i class="fa fa-pencil"></i>) icon
   to the right of the user group, and enter a new name or description.

{!save-changes.md!}

{end_tabs}

## Configure group permissions

!!! warn ""

    Guests can never manage user groups, add anyone else to a group, or remove
    anyone else from a group, even if they belong to a group that has permissions
    to do so.

!!! tip ""

    Users who can add members to a group can always join the group.

{start_tabs}

{tab|desktop-web}

{relative|group|all}

1. Select a user group.

1. Select the **General** tab on the right.

1. Under **Group permissions**, configure **Who can manage this group**, **Who
   can mention this group**, **Who can add members to this group**, **Who can join
   this group**, and **Who can leave this group**.

{!save-changes.md!}

{end_tabs}

## Add groups and users to a group

{start_tabs}

{tab|desktop-web}

{relative|group|all}

1. Select a user group.

1. Select the **Members** tab on the right.

1. Under **Add members**, enter groups and users you want to add. You can enter
   a `#channel` to add all subscribers to the group.

1. Click **Add**. Zulip will notify everyone who is added to the group.

{end_tabs}

## Remove users from a user group

{start_tabs}

{tab|desktop-web}

{relative|group|all}

1. Select a user group.

1. Select the **Members** tab on the right.

1. Under **Members**, find the user you would like to remove.

1. Click the **Remove** button in that row. Zulip will notify everyone who is
   removed from the group.

{end_tabs}

## Deactivate a user group

{start_tabs}

{tab|desktop-web}

{relative|group|all}

1. Select a user group.

1. Click the **Deactivate group** (<i class="fa fa-trash-o"></i>) button in the
   upper right corner of the user group settings panel.

1. Click **Confirm**.

{end_tabs}

## Configure who can create user groups

{!admin-only.md!}

You can configure who can create groups in your organization. Guests can never
create user groups, even if they belong to a group that has permissions to do
so.

{start_tabs}

{tab|desktop-web}

{settings_tab|organization-permissions}

1. Under **Other permissions**, configure **Who can create user groups**.

{!save-changes.md!}

{end_tabs}

## Configure who can manage user groups

{!admin-only.md!}

You can configure who can manage groups in your organization. Guests can never
manage user groups, even if they belong to a group that has permissions to do
so.

In addition, you can [give users permission](#configure-group-permissions) to
manage a specific group.

{start_tabs}

{tab|desktop-web}

{settings_tab|organization-permissions}

1. Under **Other permissions**, configure **Who can manage user groups**.

{!save-changes.md!}

{end_tabs}

## Related articles

* [User groups](/help/user-groups)
* [Mention a user or group](/help/mention-a-user-or-group)
* [Create user groups](/help/create-user-groups)
* [Moving to Zulip](/help/moving-to-zulip)
* [Roles and permissions](/help/roles-and-permissions)

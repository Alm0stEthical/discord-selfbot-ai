import type { GuildMember, Message, User } from "discord.js-selfbot-v13";

function getBaseUsername(user: User): string {
  return user.username;
}

export function resolveMemberName(member: GuildMember | null, user: User): string {
  return member?.displayName ?? getBaseUsername(user);
}

export function buildAuthorLabel(member: GuildMember | null, user: User): string {
  const displayName = resolveMemberName(member, user);
  const username = getBaseUsername(user);

  if (displayName === username) {
    return displayName;
  }

  return `${displayName} (@${username})`;
}

export function replaceUserMentions(message: Message, content: string): string {
  return content.replace(/<@!?(\d+)>/g, (_match, userId: string) => {
    const mentionedMember = message.mentions.members?.get(userId) ?? null;
    const mentionedUser = message.mentions.users.get(userId);

    if (mentionedUser) {
      return `@${resolveMemberName(mentionedMember, mentionedUser)}`;
    }

    return "@someone";
  });
}

'use strict';

class ConversationAccessPolicy {
  static canRead(conversation, userId) {
    return !!conversation?.participant(userId)?.isActive;
  }

  static canSend(conversation, userId) {
    return ConversationAccessPolicy.canRead(conversation, userId) && !conversation.archivedAt;
  }
}

module.exports = { ConversationAccessPolicy };

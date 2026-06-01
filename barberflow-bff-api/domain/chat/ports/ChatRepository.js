'use strict';

class ChatRepository {
  async findConversation(_conversationId) { throw new Error('ChatRepository.findConversation nao implementado.'); }
  async findByClientMessageId(_senderId, _clientMessageId) { throw new Error('ChatRepository.findByClientMessageId nao implementado.'); }
  async saveMessage(_message) { throw new Error('ChatRepository.saveMessage nao implementado.'); }
  async findDeliveryContext(_messageId) { throw new Error('ChatRepository.findDeliveryContext nao implementado.'); }
  async listMessagesReverse(_query) { throw new Error('ChatRepository.listMessagesReverse nao implementado.'); }
  async countRecentPairMessages(_senderId, _recipientIds, _windowSeconds) { throw new Error('ChatRepository.countRecentPairMessages nao implementado.'); }
  async countRecentDuplicateBodies(_conversationId, _senderId, _body, _windowSeconds) { throw new Error('ChatRepository.countRecentDuplicateBodies nao implementado.'); }
  async hasBidirectionalBlock(_leftUserId, _rightUserId) { throw new Error('ChatRepository.hasBidirectionalBlock nao implementado.'); }
  async softDeleteMessage(_messageId, _senderId, _retentionUntil) { throw new Error('ChatRepository.softDeleteMessage nao implementado.'); }
  async listConversationsForUser(_userId) { throw new Error('ChatRepository.listConversationsForUser nao implementado.'); }
  async findOrCreateDirect(_userA, _userB) { throw new Error('ChatRepository.findOrCreateDirect nao implementado.'); }
}

module.exports = { ChatRepository };

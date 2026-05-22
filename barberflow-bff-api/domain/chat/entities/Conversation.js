'use strict';

const { Participant } = require('./Participant');

class Conversation {
  #props;

  constructor(props) {
    this.#props = Object.freeze(props);
    Object.freeze(this);
  }

  static restore({ id, participants = [], createdAt = new Date(), archivedAt = null } = {}) {
    if (!id) throw new TypeError('Conversation requer id.');
    return new Conversation({
      id,
      participants: Object.freeze(participants.map(participant => participant instanceof Participant
        ? participant
        : Participant.restore({ ...participant, conversationId: participant.conversationId ?? id }))),
      createdAt: Conversation.#date(createdAt, 'createdAt'),
      archivedAt: archivedAt ? Conversation.#date(archivedAt, 'archivedAt') : null,
    });
  }

  static #date(value, name) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError(`Conversation.${name} invalido.`);
    return date;
  }

  get id() { return this.#props.id; }
  get participants() { return this.#props.participants; }
  get createdAt() { return this.#props.createdAt; }
  get archivedAt() { return this.#props.archivedAt; }

  activeParticipants() {
    return this.participants.filter(participant => participant.isActive);
  }

  participant(userId) {
    return this.participants.find(participant => participant.userId === userId) ?? null;
  }

  recipientIds(senderId) {
    return this.activeParticipants()
      .map(participant => participant.userId)
      .filter(userId => userId !== senderId);
  }
}

module.exports = { Conversation };

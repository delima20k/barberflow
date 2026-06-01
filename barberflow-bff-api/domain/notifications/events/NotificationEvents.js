'use strict';

const { randomUUID } = require('node:crypto');

class NotificationEvent {
  #props;

  constructor(eventName, notificationId, payload = {}) {
    this.#props = Object.freeze({
      eventId: randomUUID(),
      eventName,
      aggregateId: notificationId,
      occurredAt: new Date(),
      payload: Object.freeze({ ...payload }),
    });
    Object.freeze(this);
  }

  get eventId() { return this.#props.eventId; }
  get eventName() { return this.#props.eventName; }
  get aggregateId() { return this.#props.aggregateId; }
  get occurredAt() { return this.#props.occurredAt; }
  get payload() { return this.#props.payload; }

  toJSON() {
    return {
      eventId: this.eventId,
      eventName: this.eventName,
      aggregateId: this.aggregateId,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.payload,
    };
  }
}

class NotificationDeliveryTracked extends NotificationEvent {
  constructor(notificationId, payload = {}) {
    super('NotificationDeliveryTracked', notificationId, payload);
  }
}

class NotificationOpened extends NotificationEvent {
  constructor(notificationId, payload = {}) {
    super('NotificationOpened', notificationId, payload);
  }
}

class NotificationClicked extends NotificationEvent {
  constructor(notificationId, payload = {}) {
    super('NotificationClicked', notificationId, payload);
  }
}

class NotificationDeliveryFailed extends NotificationEvent {
  constructor(notificationId, payload = {}) {
    super('NotificationDeliveryFailed', notificationId, payload);
  }
}

module.exports = {
  NotificationDeliveryTracked,
  NotificationOpened,
  NotificationClicked,
  NotificationDeliveryFailed,
};

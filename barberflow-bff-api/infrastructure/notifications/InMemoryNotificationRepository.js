'use strict';

const { Notification } = require('../../domain/notifications/entities/Notification');
const { NotificationTemplate } = require('../../domain/notifications/entities/NotificationTemplate');
const { NotificationPreferences } = require('../../domain/notifications/entities/NotificationPreferences');

class InMemoryNotificationRepository {
  #templates = new Map();
  #preferences = new Map();
  #notifications = new Map();
  #dedupe = [];
  #deliveries = [];
  #suppressions = [];
  #digest = [];

  constructor() {
    this.inAppMessages = [];
    this.events = [];
  }

  async saveTemplate(props) {
    const result = NotificationTemplate.create(props);
    if (result.isFail()) throw new Error(result.getError());
    this.#templates.set(result.getValue().id, result.getValue());
  }

  async getTemplate(id) {
    return this.#templates.get(id) ?? null;
  }

  async savePreferences(props) {
    const result = NotificationPreferences.create(props);
    if (result.isFail()) throw new Error(result.getError());
    this.#preferences.set(result.getValue().userId, result.getValue());
  }

  async getPreferences(userId) {
    return this.#preferences.get(userId) ?? null;
  }

  async createNotification(props) {
    const result = Notification.create(props);
    if (result.isFail()) throw new Error(result.getError());
    const notification = result.getValue();
    this.#notifications.set(notification.id, notification);
    return notification;
  }

  async getNotification(id) {
    return this.#notifications.get(id) ?? null;
  }

  async hasRecentDedup({ userId, templateId, dedupeKey, windowSeconds, now }) {
    const minMs = now.getTime() - (windowSeconds * 1000);
    return this.#dedupe.some(row =>
      row.userId === userId &&
      row.templateId === templateId &&
      row.dedupeKey === dedupeKey &&
      row.createdAt.getTime() >= minMs);
  }

  async recordDedup(notification) {
    if (!notification.dedupeKey) return;
    this.#dedupe.push({
      userId: notification.userId,
      templateId: notification.templateId,
      dedupeKey: notification.dedupeKey,
      createdAt: notification.createdAt,
    });
  }

  async addToDigest(notification, channels) {
    this.#digest.push({ notificationId: notification.id, channels });
  }

  async deferNotification(notification, channels) {
    this.#digest.push({ notificationId: notification.id, channels, deferred: true });
  }

  async saveInApp(row) {
    this.inAppMessages.push({ ...row });
  }

  async suppressEndpoint(endpoint, reason) {
    this.#suppressions.push({ endpoint, reason });
  }

  async trackDelivery(notificationId, channel, result) {
    this.#deliveries.push({ notificationId, channel, result });
  }

  async markDelivered(notificationId) {
    const current = this.#notifications.get(notificationId);
    if (!current) return;
    this.#notifications.set(notificationId, Notification.create({ ...current.toJSON(), status: 'delivered' }).getValue());
  }

  async recordEvent(event) {
    this.events.push(event);
  }

  get deliveries() { return [...this.#deliveries]; }
  get suppressions() { return [...this.#suppressions]; }
}

module.exports = { InMemoryNotificationRepository };

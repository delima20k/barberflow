'use strict';

const { Notification } = require('../../domain/notifications/entities/Notification');
const { NotificationTemplate } = require('../../domain/notifications/entities/NotificationTemplate');
const { NotificationPreferences } = require('../../domain/notifications/entities/NotificationPreferences');

class SupabaseNotificationRepository {
  #db;

  constructor({ supabase }) {
    if (!supabase) throw new TypeError('SupabaseNotificationRepository.supabase obrigatorio');
    this.#db = supabase;
  }

  async getTemplate(id) {
    const { data, error } = await this.#db
      .from('notification_templates')
      .select('id, category, default_locale, channels')
      .eq('id', id)
      .single();
    if (error) return null;
    return NotificationTemplate.create({
      id: data.id,
      category: data.category,
      defaultLocale: data.default_locale,
      channels: data.channels,
    }).getValue();
  }

  async getPreferences(userId) {
    const { data, error } = await this.#db
      .from('notification_preferences')
      .select('user_id, channels_by_category, quiet_hours, digest_by_category')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return NotificationPreferences.create({
      userId: data.user_id,
      channelsByCategory: data.channels_by_category,
      quietHours: data.quiet_hours,
      digestByCategory: data.digest_by_category,
    }).getValue();
  }

  async createNotification(props) {
    const { data, error } = await this.#db
      .from('notifications')
      .insert({
        user_id: props.userId,
        template_id: props.templateId,
        category: props.category,
        priority: props.priority,
        channels: props.channels,
        dedupe_key: props.dedupeKey,
        digest_key: props.digestKey,
        payload: props.data,
        locale: props.locale,
        status: props.status,
        created_at: props.createdAt,
      })
      .select('id, user_id, template_id, category, priority, channels, dedupe_key, digest_key, payload, locale, status, created_at')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return this.#toNotification(data);
  }

  async getNotification(id) {
    const { data, error } = await this.#db
      .from('notifications')
      .select('id, user_id, template_id, category, priority, channels, dedupe_key, digest_key, payload, locale, status, created_at')
      .eq('id', id)
      .single();
    if (error) return null;
    return this.#toNotification(data);
  }

  async hasRecentDedup({ userId, templateId, dedupeKey, windowSeconds, now }) {
    const min = new Date(now.getTime() - (windowSeconds * 1000)).toISOString();
    const { data, error } = await this.#db
      .from('notification_dedup')
      .select('id')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('dedupe_key', dedupeKey)
      .gte('created_at', min)
      .limit(1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return (data ?? []).length > 0;
  }

  async recordDedup(notification) {
    if (!notification.dedupeKey) return;
    await this.#db
      .from('notification_dedup')
      .insert({
        user_id: notification.userId,
        template_id: notification.templateId,
        dedupe_key: notification.dedupeKey,
        notification_id: notification.id,
      });
  }

  async addToDigest(notification, channels) {
    await this.#db.from('notification_digest_items').insert({
      notification_id: notification.id,
      user_id: notification.userId,
      category: notification.category,
      digest_key: notification.digestKey ?? `${notification.category}:${notification.templateId}`,
      channels,
    });
  }

  async deferNotification(notification, channels) {
    await this.#db.from('notification_delayed').insert({
      notification_id: notification.id,
      user_id: notification.userId,
      channels,
      release_after: notification.createdAt.toISOString(),
    });
  }

  async saveInApp(row) {
    await this.#db.from('notification_in_app').insert({
      notification_id: row.notificationId,
      user_id: row.userId,
      title: row.title,
      body: row.body,
      payload: row.data,
    });
  }

  async suppressEndpoint(endpoint, reason) {
    await this.#db.from('notification_suppressions').upsert({ endpoint, reason, is_active: true }, { onConflict: 'endpoint' });
    await this.#db.from('push_subscriptions').update({ is_valid: false }).eq('endpoint', endpoint);
  }

  async trackDelivery(notificationId, channel, result) {
    await this.#db.from('notification_deliveries').insert({
      notification_id: notificationId,
      channel,
      status: result.ok ? 'sent' : 'failed',
      provider_message_id: result.providerMessageId ?? null,
      error: result.error ?? null,
    });
  }

  async markDelivered(notificationId) {
    await this.#db.from('notifications').update({ status: 'delivered' }).eq('id', notificationId);
  }

  async recordEvent(event) {
    await this.#db.from('notification_events').insert({
      id: event.eventId,
      event_name: event.eventName,
      notification_id: event.aggregateId,
      payload: event.payload ?? {},
      occurred_at: event.occurredAt,
    });
  }

  #toNotification(row) {
    return Notification.create({
      id: row.id,
      userId: row.user_id,
      templateId: row.template_id,
      category: row.category,
      priority: row.priority,
      channels: row.channels,
      dedupeKey: row.dedupe_key,
      digestKey: row.digest_key,
      data: row.payload,
      locale: row.locale,
      status: row.status,
      createdAt: row.created_at,
    }).getValue();
  }
}

module.exports = { SupabaseNotificationRepository };

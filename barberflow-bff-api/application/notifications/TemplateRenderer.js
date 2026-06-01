'use strict';

class TemplateRenderer {
  render({ template, notification, locale }) {
    const selectedLocale = locale ?? notification.locale ?? template.defaultLocale;
    const rendered = {};
    for (const channel of notification.channels) {
      const channelTemplate = template.getChannelTemplate(channel);
      if (!channelTemplate) continue;
      rendered[channel] = {
        title: this.#renderField(channelTemplate.title, selectedLocale, template.defaultLocale, notification.data),
        body: this.#renderField(channelTemplate.body, selectedLocale, template.defaultLocale, notification.data),
        data: { ...notification.data },
      };
    }
    return rendered;
  }

  #renderField(field, locale, fallbackLocale, data) {
    if (!field) return '';
    const raw = typeof field === 'string'
      ? field
      : (field[locale] ?? field[fallbackLocale] ?? Object.values(field)[0] ?? '');
    return String(raw).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const value = this.#read(data, key);
      return value === undefined || value === null ? '' : String(value);
    });
  }

  #read(data, key) {
    return String(key).split('.').reduce((acc, part) => acc?.[part], data);
  }
}

module.exports = { TemplateRenderer };

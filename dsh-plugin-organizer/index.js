/**
 * Host half of dsh-plugin-organizer.
 *
 * The organizer's data (categories, bundle-to-category assignments and plugin
 * presets) lives in this row's Config. Every field is volatile, so the Web tab
 * edits it through the Settings service (`ctx.remote.settings.replace`) and the
 * value is persisted in the profile's cordis.patch.yml under the
 * `plugin-organizer` row without restarting the plugin. The file can also be
 * edited by hand.
 */
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-plugin-organizer'

const Category = Schema.object({
  id: Schema.string().required().description('Stable category id.'),
  name: Schema.string().required().description('Display name.'),
})

const Preset = Schema.object({
  id: Schema.string().required().description('Stable preset id.'),
  name: Schema.string().required().description('Display name.'),
  bundles: Schema.array(Schema.string()).default([]).description('Bundle package names this preset turns on.'),
  exclusive: Schema.boolean().default(false).description('When applied, also turn off managed bundles that are not listed.'),
})

export const Config = Schema.object({
  categories: Schema.array(Category).default([]).description('User-defined plugin categories, in display order.').volatile(),
  assignments: Schema.dict(Schema.string()).default({}).description('Bundle package name to category id.').volatile(),
  presets: Schema.array(Preset).default([]).description('Saved plugin presets.').volatile(),
})

export function apply() {}

window.__ModuleLoader__.load({
  id: 'dsh-plugin-organizer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useMemo, useSyncExternalStore } = React;

    const NS = 'pluginOrganizer';
    const ENTRY = 'plugin-organizer';
    const SELF = 'dsh-plugin-organizer';
    // Profile foundations and this plugin itself never appear in the lists.
    const HIDDEN = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', SELF]);
    const UNCATEGORIZED = '';

    const zh = {
      tab: '分类与方案',
      loading: '正在读取插件列表…',
      retry: '重试',
      refresh: '重新读取',
      configMissing: '未读取到插件整理器的配置（plugin-organizer）。请确认该插件已启用后重试。',
      loadFailed: '读取失败：{msg}',
      storageHint: '分类与方案保存在当前 profile 的 cordis.patch.yml 中（plugin-organizer 一行），可以直接编辑该文件。',
      'presets.title': '配置方案',
      'presets.desc': '把需要开启的一组插件保存为方案，一键应用即可快速切换；也可以一键关闭方案中的全部插件。',
      'presets.newFromCurrent': '从当前状态新建',
      'presets.newBlank': '新建空白方案',
      'presets.empty': '还没有配置方案。用右上角的按钮新建一个，再勾选需要开启的插件。',
      'presets.count': '{n} 个插件',
      'presets.onCount': '已开启 {on}',
      'presets.exclusive': '独占',
      'presets.additive': '叠加',
      'presets.defaultName': '方案 {n}',
      'presets.exclusiveLabel': '独占模式：应用时关闭不在此方案中的其他插件',
      'presets.fillCurrent': '填入当前已启用的插件',
      'presets.clear': '清空选择',
      'presets.pick': '选择应用此方案时需要开启的插件',
      apply: '应用',
      turnOffAll: '关闭其中插件',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '确认删除？',
      save: '保存',
      cancel: '取消',
      close: '关闭',
      name: '名称',
      notInstalled: '未安装',
      'categories.title': '插件分类',
      'categories.desc': '新建分类并为每个插件指定分类；分类可以重命名、排序，也可以整组开启或关闭。',
      'categories.placeholder': '新分类名称',
      'categories.add': '添加分类',
      uncategorized: '未分类',
      enableAll: '全部开启',
      disableAll: '全部关闭',
      rename: '重命名',
      moveUp: '上移',
      moveDown: '下移',
      showOfficial: '显示官方可选插件',
      category: '分类',
      emptyGroup: '此分类下暂无插件',
      enabledCount: '已开启 {on}/{total}',
      openDetail: '打开插件详情',
      busy: '正在切换插件 {done}/{total}…',
      'result.none': '没有需要切换的插件。',
      'result.ok': '已切换 {n} 个插件。',
      'result.restart': '{n} 项更改需要重启 DSH 后生效。',
      'result.failed': '{n} 个插件切换失败：{names}',
      'result.missing': '{n} 个插件未安装，已跳过：{names}',
      saveFailed: '保存失败：{msg}',
      opFailed: '操作失败：{msg}',
    };
    const en = {
      tab: 'Groups & presets',
      loading: 'Reading plugins…',
      retry: 'Retry',
      refresh: 'Read again',
      configMissing: 'The plugin organizer configuration (plugin-organizer) is not available. Make sure the plugin is on, then retry.',
      loadFailed: 'Could not read plugins: {msg}',
      storageHint: 'Categories and presets are saved in this profile\u2019s cordis.patch.yml under plugin-organizer, so you can edit that file directly.',
      'presets.title': 'Presets',
      'presets.desc': 'Save a set of plugins to turn on as a preset and apply it in one click to switch quickly, or turn all of its plugins off.',
      'presets.empty': 'No presets yet. Create one with the button above, then pick the plugins it should turn on.',
      'presets.count': '{n} plugins',
      'presets.onCount': '{on} on',
      'presets.exclusive': 'Exclusive',
      'presets.additive': 'Additive',
      'presets.defaultName': 'Preset {n}',
      'presets.exclusiveLabel': 'Exclusive: turn off other plugins that are not in this preset when applying',
      'presets.fillCurrent': 'Use plugins that are on now',
      'presets.clear': 'Clear selection',
      'presets.pick': 'Choose the plugins this preset turns on',
      apply: 'Apply',
      turnOffAll: 'Turn its plugins off',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Confirm delete?',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      name: 'Name',
      notInstalled: 'Not installed',
      'categories.title': 'Categories',
      'categories.desc': 'Create categories and assign each plugin to one. Categories can be renamed, reordered, and switched on or off as a group.',
      'categories.placeholder': 'New category name',
      'categories.add': 'Add category',
      uncategorized: 'Uncategorized',
      enableAll: 'Turn all on',
      disableAll: 'Turn all off',
      rename: 'Rename',
      moveUp: 'Move up',
      moveDown: 'Move down',
      showOfficial: 'Show optional official plugins',
      category: 'Category',
      emptyGroup: 'No plugins in this category',
      enabledCount: '{on}/{total} on',
      openDetail: 'Open plugin details',
      busy: 'Switching plugins {done}/{total}…',
      'result.none': 'Nothing needed to change.',
      'result.ok': 'Switched {n} plugins.',
      'result.restart': '{n} changes take effect after DSH restarts.',
      'result.failed': '{n} plugins failed to switch: {names}',
      'result.missing': '{n} plugins are not installed and were skipped: {names}',
      saveFailed: 'Could not save: {msg}',
      opFailed: 'Operation failed: {msg}',
    };

    function fmt(text, params) {
      return String(text).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : m));
    }
    function errorText(error) {
      return error instanceof Error ? error.message : String(error);
    }
    function newId(prefix) {
      return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Call one Remote method and unwrap the `{ ok, value | error }` answer. */
    async function call(service, method, ...args) {
      if (!service || typeof service[method] !== 'function') throw new Error('remote method ' + method + ' is unavailable');
      const res = await service[method](...args);
      if (res && typeof res === 'object' && 'ok' in res && ('value' in res || 'error' in res)) {
        if (!res.ok) {
          const error = new Error((res.error && res.error.message) || 'remote call failed');
          error.code = res.error && res.error.code;
          throw error;
        }
        return res.value;
      }
      return res;
    }

    function normalize(value) {
      const v = value && typeof value === 'object' ? value : {};
      const categories = (Array.isArray(v.categories) ? v.categories : [])
        .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
        .map(c => ({ id: c.id, name: c.name }));
      const ids = new Set(categories.map(c => c.id));
      const assignments = {};
      if (v.assignments && typeof v.assignments === 'object') {
        for (const [bundle, cat] of Object.entries(v.assignments)) {
          if (typeof cat === 'string' && ids.has(cat)) assignments[bundle] = cat;
        }
      }
      const presets = (Array.isArray(v.presets) ? v.presets : [])
        .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
        .map(p => ({
          id: p.id,
          name: p.name,
          bundles: Array.from(new Set((Array.isArray(p.bundles) ? p.bundles : []).filter(b => typeof b === 'string'))),
          exclusive: p.exclusive === true,
        }));
      return { categories, assignments, presets };
    }

    /** Whether the organizer lists this bundle at all. */
    function manageable(bundle) {
      return !HIDDEN.has(bundle.name) && !bundle.readOnlyReason && bundle.availability !== 'missing';
    }

    function createStore(ctx) {
      let state = {
        loading: true, error: null, bundles: [], data: normalize(null), revision: undefined,
        busy: null, notice: null, showOfficial: false,
      };
      const listeners = new Set();
      let disposed = false;
      let seq = 0;
      const tr = key => ctx.locale.bind(NS)(key);
      const set = patch => {
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
      };
      const service = name => {
        let found;
        try { found = ctx.get('remote.' + name); } catch (_) { found = undefined; }
        if (found) return found;
        try { return ctx.remote && ctx.remote[name]; } catch (_) { return undefined; }
      };

      async function refresh() {
        const mine = ++seq;
        try {
          const [bundles, view] = await Promise.all([
            call(service('pluginManager'), 'listBundles'),
            call(service('settings'), 'describe'),
          ]);
          if (disposed || mine !== seq) return;
          const ns = ((view && view.namespaces) || []).find(n => n.ns === ENTRY);
          set({
            loading: false,
            error: ns ? null : tr('configMissing'),
            bundles: Array.isArray(bundles) ? bundles : [],
            data: normalize(ns && ns.value),
            revision: ns ? ns.revision : undefined,
          });
        } catch (error) {
          if (disposed || mine !== seq) return;
          set({ loading: false, error: fmt(tr('loadFailed'), { msg: errorText(error) }) });
        }
      }

      async function write(mutator) {
        const next = normalize(mutator(normalize(state.data)));
        const view = await call(service('settings'), 'replace', ENTRY, next, state.revision);
        set({ data: normalize(view && view.value ? view.value : next), revision: view ? view.revision : state.revision });
      }

      /** Persist a change to categories, assignments, or presets; retry once after a concurrent edit. */
      async function save(mutator) {
        if (state.revision === undefined) {
          set({ notice: { kind: 'error', text: tr('configMissing') } });
          return false;
        }
        try {
          try {
            await write(mutator);
          } catch (error) {
            if (error && error.code === 'settings/conflict') {
              await refresh();
              await write(mutator);
            } else throw error;
          }
          return true;
        } catch (error) {
          set({ notice: { kind: 'error', text: fmt(tr('saveFailed'), { msg: errorText(error) }) } });
          return false;
        }
      }

      /** Switch bundles one after another, disables first, and report the outcome. */
      async function switchBundles(targets) {
        if (state.busy) return;
        const byName = new Map(state.bundles.map(b => [b.name, b]));
        const wanted = new Map();
        for (const target of targets) if (!HIDDEN.has(target.name)) wanted.set(target.name, target.enabled);
        const missing = [];
        const todo = [];
        for (const [name, enabled] of wanted) {
          const bundle = byName.get(name);
          if (!bundle || bundle.availability === 'missing') { if (enabled) missing.push(name); continue; }
          if (bundle.readOnlyReason) continue;
          if (bundle.enabled !== enabled) todo.push({ name, enabled });
        }
        todo.sort((a, b) => Number(a.enabled) - Number(b.enabled));
        let switched = 0;
        let restart = 0;
        const failed = [];
        set({ busy: { done: 0, total: todo.length }, notice: null });
        for (let i = 0; i < todo.length; i++) {
          const target = todo[i];
          set({ busy: { done: i, total: todo.length } });
          try {
            const result = await call(service('pluginManager'), 'setBundleEnabled', target.name, target.enabled);
            const application = result && result.application;
            if (application === 'failed' || application === 'cancelled' || (result && result.error && !result.changed)) {
              const code = result && result.error ? result.error.code : application;
              failed.push(target.name + ' (' + code + ')');
            } else {
              switched++;
              if (application === 'restart-required') restart++;
            }
          } catch (error) {
            failed.push(target.name + ' (' + errorText(error) + ')');
          }
        }
        if (disposed) return;
        set({ busy: null });
        await refresh();
        const lines = [];
        if (todo.length === 0 && missing.length === 0) lines.push(tr('result.none'));
        if (switched > 0) lines.push(fmt(tr('result.ok'), { n: switched }));
        if (restart > 0) lines.push(fmt(tr('result.restart'), { n: restart }));
        if (failed.length > 0) lines.push(fmt(tr('result.failed'), { n: failed.length, names: failed.join(', ') }));
        if (missing.length > 0) lines.push(fmt(tr('result.missing'), { n: missing.length, names: missing.join(', ') }));
        set({ notice: { kind: failed.length > 0 ? 'error' : restart > 0 || missing.length > 0 ? 'warn' : 'ok', text: lines.join(' ') } });
      }

      const store = {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        getSnapshot() { return state; },
        refresh,
        setShowOfficial(value) { set({ showOfficial: value }); },
        dismissNotice() { set({ notice: null }); },
        // Categories
        addCategory(name) {
          const trimmed = name.trim();
          if (!trimmed) return;
          return save(d => ({ ...d, categories: [...d.categories, { id: newId('cat'), name: trimmed }] }));
        },
        renameCategory(id, name) {
          const trimmed = name.trim();
          if (!trimmed) return;
          return save(d => ({ ...d, categories: d.categories.map(c => (c.id === id ? { ...c, name: trimmed } : c)) }));
        },
        deleteCategory(id) {
          return save(d => {
            const assignments = {};
            for (const [bundle, cat] of Object.entries(d.assignments)) if (cat !== id) assignments[bundle] = cat;
            return { ...d, categories: d.categories.filter(c => c.id !== id), assignments };
          });
        },
        moveCategory(id, delta) {
          return save(d => {
            const list = [...d.categories];
            const index = list.findIndex(c => c.id === id);
            const target = index + delta;
            if (index < 0 || target < 0 || target >= list.length) return d;
            const [item] = list.splice(index, 1);
            list.splice(target, 0, item);
            return { ...d, categories: list };
          });
        },
        assign(bundle, categoryId) {
          return save(d => {
            const assignments = { ...d.assignments };
            if (categoryId) assignments[bundle] = categoryId;
            else delete assignments[bundle];
            return { ...d, assignments };
          });
        },
        // Presets
        async createPreset(fromCurrent) {
          if (state.revision === undefined) return undefined;
          const id = newId('preset');
          const bundles = fromCurrent
            ? state.bundles.filter(b => manageable(b) && b.enabled).map(b => b.name)
            : [];
          const name = fmt(tr('presets.defaultName'), { n: state.data.presets.length + 1 });
          const ok = await save(d => ({ ...d, presets: [...d.presets, { id, name, bundles, exclusive: false }] }));
          return ok ? id : undefined;
        },
        updatePreset(id, patch) {
          return save(d => ({ ...d, presets: d.presets.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
        },
        deletePreset(id) {
          return save(d => ({ ...d, presets: d.presets.filter(p => p.id !== id) }));
        },
        applyPreset(id) {
          const preset = state.data.presets.find(p => p.id === id);
          if (!preset) return;
          const targets = preset.bundles.map(name => ({ name, enabled: true }));
          if (preset.exclusive) {
            const listed = new Set(preset.bundles);
            for (const bundle of state.bundles) {
              if (manageable(bundle) && bundle.enabled && !listed.has(bundle.name)) targets.push({ name: bundle.name, enabled: false });
            }
          }
          return switchBundles(targets);
        },
        turnOffPreset(id) {
          const preset = state.data.presets.find(p => p.id === id);
          if (!preset) return;
          return switchBundles(preset.bundles.map(name => ({ name, enabled: false })));
        },
        // Switching
        setBundle(name, enabled) { return switchBundles([{ name, enabled }]); },
        setGroup(names, enabled) { return switchBundles(names.map(name => ({ name, enabled }))); },
        dispose() { disposed = true; listeners.clear(); },
      };
      return store;
    }

    const CSS = `
.dpo-root{display:flex;flex-direction:column;gap:24px;padding:8px 0 40px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dpo-btn,.dpo-btn-icon,.dpo-chip,.dpo-tag,.dpo-dot,.dpo-input,.dpo-select,.dpo-card,.dpo-group,.dpo-notice,.dpo-picker,.dpo-row-icon,.dpo-switch,.dpo-switch::after{corner-shape:round}
.dpo-section{display:flex;flex-direction:column;gap:12px}
.dpo-section+.dpo-section{padding-top:24px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dpo-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px}
.dpo-h{margin:0;flex:1 1 auto;min-width:120px;font-size:13px;font-weight:600;line-height:20px}
.dpo-sub{margin:0;max-width:68ch;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dpo-foot{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dpo-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto}
.dpo-card{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.dpo-card-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dpo-card-name{flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpo-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dpo-chips{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.dpo-chip{max-width:100%;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpo-chip[data-state=on]{color:var(--dsw-alias-label-primary)}
.dpo-chip[data-state=missing]{color:var(--dsw-alias-state-warn-label)}
.dpo-tag{flex:none;padding:0 6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap}
.dpo-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 12px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;transition:background .1s ease,color .1s ease,opacity .1s ease}
.dpo-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dpo-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dpo-btn:disabled{opacity:.4;cursor:not-allowed}
.dpo-btn[data-variant=outline]{box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3)}
.dpo-btn[data-variant=primary]{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}
.dpo-btn[data-variant=primary]:hover:not(:disabled),.dpo-btn[data-variant=primary]:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dpo-btn[data-variant=danger]{color:var(--dsw-alias-state-error-primary)}
.dpo-btn[data-variant=danger]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.dpo-btn-icon{width:28px;padding:0;border-radius:var(--dsw-radius-sm);font-size:13px}
.dpo-btn-icon svg{display:block;width:15px;height:15px;color:inherit}
.dpo-btn:focus-visible,.dpo-input:focus-visible,.dpo-select:focus-visible,.dpo-switch:focus-visible,.dpo-link:focus-visible,.dpo-check input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.dpo-input{box-sizing:border-box;height:34px;min-width:0;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}
.dpo-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.dpo-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dpo-select{box-sizing:border-box;flex:none;height:26px;max-width:150px;padding:0 4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dpo-select:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dpo-group{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dpo-group-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;background:var(--dsw-alias-bg-layer-2)}
.dpo-group-name{flex:1 1 auto;min-width:80px;font-size:13px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpo-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dpo-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dpo-row-icon{flex:none;width:32px;height:32px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);object-fit:cover}
.dpo-row-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.dpo-link{all:unset;box-sizing:border-box;max-width:100%;font-size:13px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.dpo-link:hover{color:var(--dsw-alias-link)}
.dpo-desc{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpo-empty{padding:12px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dpo-switch{box-sizing:border-box;position:relative;flex:none;width:36px;height:20px;padding:2px;border:none;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));cursor:pointer;transition:background .12s ease}
.dpo-switch::after{content:"";display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-label-primary));transition:transform .12s ease,background .12s ease}
.dpo-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dpo-switch[aria-checked="true"]::after{transform:translateX(16px)}
.dpo-switch:disabled{opacity:.5;cursor:not-allowed}
.dpo-notice{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px}
.dpo-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dpo-notice[data-kind=ok] .dpo-dot{background:var(--dsw-alias-state-success-primary)}
.dpo-notice[data-kind=warn] .dpo-dot{background:var(--dsw-alias-state-warn-primary)}
.dpo-notice[data-kind=error] .dpo-dot{background:var(--dsw-alias-state-error-primary)}
.dpo-notice[data-kind=busy] .dpo-dot{background:var(--dsw-alias-state-business-primary);animation:dpo-pulse 1s ease-in-out infinite}
.dpo-notice-text{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.dpo-notice[data-kind=error] .dpo-notice-text{color:var(--dsw-alias-state-error-primary)}
@keyframes dpo-pulse{0%,100%{opacity:1}50%{opacity:.25}}
.dpo-picker{display:flex;flex-direction:column;gap:12px;max-height:320px;overflow:auto;padding:12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}
.dpo-picker-group{display:flex;flex-direction:column;gap:4px}
.dpo-picker-name{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:600;line-height:18px}
.dpo-check{display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:13px;line-height:20px;cursor:pointer}
.dpo-check input{flex:none;margin:0;width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary)}
.dpo-check span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpo-spacer{flex:1 1 auto;min-width:0}
`;

    const FALLBACK_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><g fill="#7f8cff"><circle cx="12" cy="12" r="4"/><circle cx="24" cy="24" r="4"/><circle cx="24" cy="12" r="4" opacity=".5"/><circle cx="12" cy="24" r="4" opacity=".5"/></g></svg>');

    /** Host-matched compact button: ghost by default, plus outline / primary / danger variants. */
    function Button(props) {
      const { variant, icon, className, ...rest } = props;
      const cls = 'dpo-btn' + (icon ? ' dpo-btn-icon' : '') + (className ? ' ' + className : '');
      return h('button', { type: 'button', ...rest, className: cls, 'data-variant': variant });
    }

    /** Stroke icons at the host's 15px icon-button size, inheriting the button color. */
    function Icon({ name }) {
      const common = {
        width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
      };
      if (name === 'refresh') {
        return h('svg', common,
          h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.7-4' }),
          h('path', { d: 'M13.6 2.6v3.2h-3.2' }));
      }
      if (name === 'up') return h('svg', common, h('path', { d: 'M8 13V3.5M3.8 7.7 8 3.5l4.2 4.2' }));
      if (name === 'down') return h('svg', common, h('path', { d: 'M8 3v9.5M3.8 8.3 8 12.5l4.2-4.2' }));
      if (name === 'close') return h('svg', common, h('path', { d: 'M4 4l8 8M12 4l-8 8' }));
      return null;
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button', role: 'switch', className: 'dpo-switch', 'aria-checked': checked ? 'true' : 'false',
        'aria-label': label, title: label, disabled, onClick: () => onChange(!checked),
      });
    }

    /** Two-step delete: the first click arms, the second confirms. */
    function DeleteButton({ t, onConfirm, disabled }) {
      const [armed, setArmed] = useState(false);
      return h(Button, {
        variant: 'danger', disabled,
        onClick: () => (armed ? (setArmed(false), onConfirm()) : setArmed(true)),
        onBlur: () => setArmed(false),
      }, armed ? t('confirmDelete') : t('delete'));
    }

    function Notice({ t, notice, onDismiss }) {
      if (!notice) return null;
      return h('div', {
        className: 'dpo-notice', 'data-kind': notice.kind,
        role: notice.kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite',
      },
      h('span', { className: 'dpo-dot', 'aria-hidden': 'true' }),
      h('span', { className: 'dpo-notice-text' }, notice.text),
      onDismiss ? h(Button, { icon: true, 'aria-label': t('close'), title: t('close'), onClick: onDismiss }, h(Icon, { name: 'close' })) : null);
    }

    function useDisplay(resolveText) {
      return useMemo(() => {
        const text = value => {
          if (value === undefined || value === null) return undefined;
          if (typeof value === 'string') return value;
          try { const resolved = resolveText(value); if (typeof resolved === 'string') return resolved; } catch (_) {}
          return value.zh || value.en || Object.values(value)[0];
        };
        return {
          title: bundle => (bundle && text(bundle.meta && bundle.meta.title)) || (bundle && bundle.name) || '',
          description: bundle => (bundle && (text(bundle.meta && bundle.meta.description) || bundle.description)) || '',
        };
      }, [resolveText]);
    }

    function PresetEditor({ t, preset, groups, bundlesByName, display, onSave, onCancel, busy }) {
      const [name, setName] = useState(preset.name);
      const [exclusive, setExclusive] = useState(preset.exclusive);
      const [selected, setSelected] = useState(() => new Set(preset.bundles));
      const toggle = (bundle, on) => setSelected(prev => {
        const next = new Set(prev);
        if (on) next.add(bundle); else next.delete(bundle);
        return next;
      });
      const listed = new Set(groups.flatMap(g => g.bundles.map(b => b.name)));
      const extra = Array.from(selected).filter(n => !listed.has(n));
      const item = (bundleName, label, tag) => h('label', { key: bundleName, className: 'dpo-check', title: bundleName },
        h('input', { type: 'checkbox', checked: selected.has(bundleName), onChange: e => toggle(bundleName, e.target.checked) }),
        h('span', null, label),
        tag ? h('span', { className: 'dpo-tag' }, tag) : null);
      return h('div', { className: 'dpo-card' },
        h('div', { className: 'dpo-card-row' },
          h('input', {
            className: 'dpo-input', style: { flex: '1 1 220px' }, value: name, 'aria-label': t('name'), placeholder: t('name'),
            onChange: e => setName(e.target.value),
          })),
        h('label', { className: 'dpo-check' },
          h('input', { type: 'checkbox', checked: exclusive, onChange: e => setExclusive(e.target.checked) }),
          h('span', null, t('presets.exclusiveLabel'))),
        h('div', { className: 'dpo-card-row' },
          h('span', { className: 'dpo-meta dpo-spacer' }, t('presets.pick') + ' · ' + fmt(t('presets.count'), { n: selected.size })),
          h(Button, {
            onClick: () => setSelected(new Set(Array.from(bundlesByName.values()).filter(b => manageable(b) && b.enabled).map(b => b.name))),
          }, t('presets.fillCurrent')),
          h(Button, { onClick: () => setSelected(new Set()) }, t('presets.clear'))),
        h('div', { className: 'dpo-picker' },
          groups.filter(g => g.bundles.length > 0).map(g => h('div', { key: g.id || '_none', className: 'dpo-picker-group' },
            h('div', { className: 'dpo-picker-name' }, g.name),
            g.bundles.map(b => item(b.name, display.title(b), null)))),
          extra.length > 0 ? h('div', { className: 'dpo-picker-group' },
            h('div', { className: 'dpo-picker-name' }, t('notInstalled')),
            extra.map(n => item(n, n, t('notInstalled')))) : null),
        h('div', { className: 'dpo-card-row' },
          h('span', { className: 'dpo-spacer' }),
          h(Button, { onClick: onCancel }, t('cancel')),
          h(Button, {
            variant: 'primary', disabled: busy || !name.trim(),
            onClick: () => onSave({ name: name.trim(), exclusive, bundles: Array.from(selected) }),
          }, t('save'))));
    }

    function PresetCard({ t, preset, bundlesByName, display, busy, onEdit, store }) {
      const missing = [];
      let on = 0;
      const chips = preset.bundles.map(n => {
        const bundle = bundlesByName.get(n);
        const absent = !bundle || bundle.availability === 'missing';
        if (absent) missing.push(n);
        else if (bundle.enabled) on++;
        return h('span', {
          key: n, title: n,
          className: 'dpo-chip', 'data-state': absent ? 'missing' : bundle.enabled ? 'on' : 'off',
        }, absent ? n + ' · ' + t('notInstalled') : display.title(bundle));
      });
      return h('div', { className: 'dpo-card' },
        h('div', { className: 'dpo-card-row' },
          h('span', { className: 'dpo-card-name', title: preset.name }, preset.name),
          h('span', { className: 'dpo-tag' }, preset.exclusive ? t('presets.exclusive') : t('presets.additive')),
          h('span', { className: 'dpo-meta' }, fmt(t('presets.count'), { n: preset.bundles.length })),
          preset.bundles.length > 0 ? h('span', { className: 'dpo-meta' }, '· ' + fmt(t('presets.onCount'), { on })) : null),
        chips.length > 0 ? h('div', { className: 'dpo-chips' }, chips) : null,
        h('div', { className: 'dpo-card-row' },
          h(Button, { variant: 'primary', disabled: busy || preset.bundles.length === 0, onClick: () => store.applyPreset(preset.id) }, t('apply')),
          h(Button, { disabled: busy || preset.bundles.length === 0, onClick: () => store.turnOffPreset(preset.id) }, t('turnOffAll')),
          h('span', { className: 'dpo-spacer' }),
          h(Button, { disabled: busy, onClick: onEdit }, t('edit')),
          h(DeleteButton, { t, disabled: busy, onConfirm: () => store.deletePreset(preset.id) })));
    }

    function PresetsSection({ t, state, store, groups, bundlesByName, display }) {
      const [editing, setEditing] = useState(null);
      const busy = !!state.busy;
      const create = async fromCurrent => {
        const id = await store.createPreset(fromCurrent);
        if (id) setEditing(id);
      };
      return h('section', { className: 'dpo-section' },
        h('div', { className: 'dpo-head' },
          h('h3', { className: 'dpo-h' }, t('presets.title')),
          h('div', { className: 'dpo-actions' },
            h(Button, { variant: 'outline', disabled: busy, onClick: () => create(false) }, t('presets.newBlank')),
            h(Button, { variant: 'outline', disabled: busy, onClick: () => create(true) }, t('presets.newFromCurrent')))),
        state.data.presets.map(preset => editing === preset.id
          ? h(PresetEditor, {
            key: preset.id, t, preset, groups, bundlesByName, display, busy,
            onCancel: () => setEditing(null),
            onSave: async patch => { await store.updatePreset(preset.id, patch); setEditing(null); },
          })
          : h(PresetCard, { key: preset.id, t, preset, bundlesByName, display, busy, store, onEdit: () => setEditing(preset.id) })));
    }

    function GroupHeader({ t, group, index, count, store, busy }) {
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState(group.name);
      const on = group.bundles.filter(b => b.enabled).length;
      const names = group.bundles.map(b => b.name);
      const real = group.id !== UNCATEGORIZED;
      return h('div', { className: 'dpo-group-head' },
        renaming
          ? h('input', {
            className: 'dpo-input', style: { flex: '1 1 160px', height: '28px' }, value: draft, autoFocus: true, 'aria-label': t('rename'),
            onChange: e => setDraft(e.target.value),
            onKeyDown: e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { store.renameCategory(group.id, draft); setRenaming(false); }
              if (e.key === 'Escape') { setDraft(group.name); setRenaming(false); }
            },
          })
          : h('span', { className: 'dpo-group-name', title: group.name }, group.name),
        h('span', { className: 'dpo-meta' }, fmt(t('enabledCount'), { on, total: group.bundles.length })),
        renaming ? h(Button, { variant: 'primary', onClick: () => { store.renameCategory(group.id, draft); setRenaming(false); } }, t('save')) : null,
        real && !renaming ? h(Button, { icon: true, disabled: busy || index === 0, 'aria-label': t('moveUp'), title: t('moveUp'), onClick: () => store.moveCategory(group.id, -1) }, h(Icon, { name: 'up' })) : null,
        real && !renaming ? h(Button, { icon: true, disabled: busy || index === count - 1, 'aria-label': t('moveDown'), title: t('moveDown'), onClick: () => store.moveCategory(group.id, 1) }, h(Icon, { name: 'down' })) : null,
        real && !renaming ? h(Button, { variant: 'outline', disabled: busy, onClick: () => { setDraft(group.name); setRenaming(true); } }, t('rename')) : null,
        real && !renaming ? h(DeleteButton, { t, disabled: busy, onConfirm: () => store.deleteCategory(group.id) }) : null,
        h(Button, { disabled: busy || names.length === 0 || on === group.bundles.length, onClick: () => store.setGroup(names, true) }, t('enableAll')),
        h(Button, { disabled: busy || on === 0, onClick: () => store.setGroup(names, false) }, t('disableAll')));
    }

    function BundleRow({ t, bundle, categories, assigned, display, store, busy, openPackage }) {
      const title = display.title(bundle);
      const description = bundle.error ? (bundle.error.diagnostic || bundle.error.code) : display.description(bundle);
      return h('div', { className: 'dpo-row' },
        h('img', { className: 'dpo-row-icon', src: (bundle.meta && bundle.meta.icon) || FALLBACK_ICON, alt: '' }),
        h('div', { className: 'dpo-row-body' },
          typeof openPackage === 'function'
            ? h('button', { type: 'button', className: 'dpo-link', title: t('openDetail') + ' · ' + bundle.name, onClick: () => openPackage(bundle.name) }, title)
            : h('span', { className: 'dpo-link', title: bundle.name }, title),
          h('span', { className: 'dpo-desc', title: description }, description || ' ')),
        h('select', {
          className: 'dpo-select', value: assigned || UNCATEGORIZED, 'aria-label': t('category') + ' · ' + title, disabled: busy,
          onChange: e => store.assign(bundle.name, e.target.value),
        },
        h('option', { value: UNCATEGORIZED }, t('uncategorized')),
        categories.map(c => h('option', { key: c.id, value: c.id }, c.name))),
        h(Switch, {
          checked: !!bundle.enabled, disabled: busy || (!bundle.enabled && !!bundle.error),
          label: title, onChange: next => store.setBundle(bundle.name, next),
        }));
    }

    function CategoriesSection({ t, state, store, groups, display, openPackage }) {
      const [draft, setDraft] = useState('');
      const busy = !!state.busy;
      const add = () => { if (draft.trim()) { store.addCategory(draft); setDraft(''); } };
      const realCount = state.data.categories.length;
      return h('section', { className: 'dpo-section' },
        h('div', { className: 'dpo-head' },
          h('h3', { className: 'dpo-h' }, t('categories.title')),
          h('div', { className: 'dpo-actions' },
            h(Button, { icon: true, disabled: busy, 'aria-label': t('refresh'), title: t('refresh'), onClick: () => store.refresh() }, h(Icon, { name: 'refresh' })),
            h('label', { className: 'dpo-check' },
              h('input', { type: 'checkbox', checked: state.showOfficial, onChange: e => store.setShowOfficial(e.target.checked) }),
              h('span', null, t('showOfficial'))))),
        h('div', { className: 'dpo-card-row' },
          h('input', {
            className: 'dpo-input', style: { flex: '1 1 220px' }, value: draft, placeholder: t('categories.placeholder'), 'aria-label': t('categories.placeholder'),
            onChange: e => setDraft(e.target.value),
            onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); },
          }),
          h(Button, { variant: 'outline', disabled: !draft.trim() || busy, onClick: add }, t('categories.add'))),
        groups.map((group, index) => h('div', { key: group.id || '_none', className: 'dpo-group' },
          h(GroupHeader, { t, group, index, count: realCount, store, busy }),
          group.bundles.length === 0
            ? h('div', { className: 'dpo-empty' }, t('emptyGroup'))
            : group.bundles.map(bundle => h(BundleRow, {
              key: bundle.name, t, bundle, display, store, busy, openPackage,
              categories: state.data.categories, assigned: state.data.assignments[bundle.name],
            })))));
    }

    function OrganizerTab(props) {
      const { t, store, resolveText, openPackage } = props;
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
      const display = useDisplay(resolveText);
      const bundlesByName = useMemo(() => new Map(state.bundles.map(b => [b.name, b])), [state.bundles]);
      const visible = useMemo(() => state.bundles.filter(b => manageable(b) && (
        !b.official || b.installed || b.enabled || state.showOfficial || !!state.data.assignments[b.name]
      ) && (b.listedByDefault !== false || b.enabled || b.installed)), [state.bundles, state.showOfficial, state.data.assignments]);
      const groups = useMemo(() => {
        const byCategory = new Map(state.data.categories.map(c => [c.id, []]));
        const rest = [];
        for (const bundle of visible) {
          const cat = state.data.assignments[bundle.name];
          if (cat && byCategory.has(cat)) byCategory.get(cat).push(bundle);
          else rest.push(bundle);
        }
        const sort = list => list.sort((a, b) => display.title(a).localeCompare(display.title(b)));
        const result = state.data.categories.map(c => ({ id: c.id, name: c.name, bundles: sort(byCategory.get(c.id)) }));
        if (rest.length > 0 || result.length === 0) result.push({ id: UNCATEGORIZED, name: t('uncategorized'), bundles: sort(rest) });
        return result;
      }, [visible, state.data, display, t]);

      const status = state.busy
        ? {
          kind: 'busy',
          text: fmt(t('busy'), {
            done: Math.min(state.busy.done + 1, Math.max(state.busy.total, 1)),
            total: Math.max(state.busy.total, 1),
          }),
        }
        : state.notice;

      const body = [];
      if (state.loading && state.bundles.length === 0) {
        body.push(h('p', { key: 'loading', className: 'dpo-sub', role: 'status' }, t('loading')));
      } else if (state.error && state.bundles.length === 0) {
        body.push(h('div', { key: 'error', className: 'dpo-notice', 'data-kind': 'error', role: 'alert' },
          h('span', { className: 'dpo-dot', 'aria-hidden': 'true' }),
          h('span', { className: 'dpo-notice-text' }, state.error),
          h(Button, { onClick: () => store.refresh() }, t('retry'))));
      } else {
        if (state.error) body.push(h(Notice, { key: 'cfg', t, notice: { kind: 'error', text: state.error }, onDismiss: () => store.refresh() }));
        body.push(h(PresetsSection, { key: 'presets', t, state, store, groups, bundlesByName, display }));
        body.push(h(CategoriesSection, { key: 'categories', t, state, store, groups, display, openPackage }));
      }
      return h('div', { className: 'dpo-root' },
        h('style', null, CSS),
        h(Notice, { t, notice: status, onDismiss: state.busy ? null : () => store.dismissNotice() }),
        body);
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-organizer: dictionaries');
        const store = createStore(ctx);
        ctx.effect(() => {
          store.refresh();
          const disposers = [];
          const remote = ctx.remote;
          let timer;
          const schedule = () => {
            if (store.getSnapshot().busy) return;
            clearTimeout(timer);
            timer = setTimeout(() => store.refresh(), 250);
          };
          if (remote && typeof remote.$on === 'function') {
            for (const name of ['plugin-manager/changed']) {
              try { disposers.push(remote.$on(name, schedule)); } catch (_) {}
            }
            try {
              disposers.push(remote.$on('settings/document-updated', ns => { if (ns === undefined || ns === ENTRY) schedule(); }));
            } catch (_) {}
          }
          try { disposers.push(ctx.on('connection/reset', schedule)); } catch (_) {}
          return () => {
            clearTimeout(timer);
            for (const dispose of disposers) if (typeof dispose === 'function') dispose();
            store.dispose();
          };
        }, 'plugin-organizer: store');
        const resolveText = text => (typeof ctx.locale.resolveText === 'function' ? ctx.locale.resolveText(text) : undefined);
        ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'plugin-organizer',
          order: 50,
          locale: NS,
          label: () => ctx.locale.bind(NS)('tab'),
          inject: () => ({ store, resolveText }),
        }, OrganizerTab));
      },
    };
  },
});

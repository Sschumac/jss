/* @flow */

import findRenderer from './utils/findRenderer'
import RulesContainer from './RulesContainer'
import type {
  InstanceStyleSheetOptions,
  StyleSheetOptions,
  Rule,
  toCssOptions,
  RuleOptions
} from './types'

export default class StyleSheet {
  options: InstanceStyleSheetOptions

  linked: boolean

  deployed: boolean

  attached: boolean

  rules: RulesContainer

  renderer: JssRenderer

  classes: Object

  queue: ?Array<Rule>

  constructor(styles: Object, options: StyleSheetOptions) {
    const index = typeof options.index === 'number' ? options.index : 0
    const Renderer = findRenderer(options)

    this.attached = false
    this.deployed = false
    this.linked = false
    this.classes = Object.create(null)
    this.options = {
      sheet: this,
      parent: this,
      classes: this.classes,
      index,
      Renderer,
      ...options
    }
    this.renderer = (new Renderer(this): JssRenderer)
    this.renderer.createElement()
    this.rules = new RulesContainer(this.options)

    for (const name in styles) {
      this.rules.createAndRegister(name, styles[name])
    }

    const {plugins} = options.jss
    this.rules.getIndex().forEach(plugins.onProcessRule, plugins)
  }

  /**
   * Attach renderable to the render tree.
   */
  attach(): StyleSheet {
    if (this.attached) return this
    if (!this.deployed) this.deploy()
    this.renderer.attach()
    if (!this.linked && this.options.link) this.link()
    this.attached = true
    return this
  }

  /**
   * Remove renderable from render tree.
   */
  detach(): StyleSheet {
    if (!this.attached) return this
    this.renderer.detach()
    this.attached = false
    return this
  }

  /**
   * Add a rule to the current stylesheet.
   * Will insert a rule also after the stylesheet has been rendered first time.
   */
  addRule(name: string, style: Object, options?: RuleOptions): Rule {
    const {queue} = this

    // Plugins can create rules.
    // In order to preserve the right order, we need to queue all `.addRule` calls,
    // which happen after the first `rules.create()` call.
    if (this.attached && !queue) this.queue = []

    const rule = this.rules.create(name, style, options)

    if (this.attached) {
      if (!this.deployed) return rule
      // Don't insert rule directly if there is no stringified version yet.
      // It will be inserted all together when .attach is called.
      if (queue) queue.push(rule)
      else {
        const renderable = this.renderer.insertRule(rule)
        if (this.options.link) rule.renderable = renderable
        if (this.queue) {
          this.queue.forEach(this.renderer.insertRule, this.renderer)
          this.queue = undefined
        }
      }
      return rule
    }

    // We can't add rules to a detached style node.
    // We will redeploy the sheet once user will attach it.
    this.deployed = false

    return rule
  }

  /**
   * Create and add rules.
   * Will render also after Style Sheet was rendered the first time.
   */
  addRules(styles: Object, options?: RuleOptions): Array<Rule> {
    const added = []
    for (const name in styles) {
      added.push(this.addRule(name, styles[name], options))
    }
    return added
  }

  /**
   * Get a rule by name.
   */
  getRule(name: string): Rule {
    return this.rules.get(name)
  }

  /**
   * Delete a rule by name.
   * Returns `true`: if rule has been deleted from the DOM.
   */
  deleteRule(name: string): boolean {
    const rule = this.rules.get(name)

    if (!rule) return false

    this.rules.remove(rule)

    if (this.attached && rule.renderable) {
      return this.renderer.deleteRule(rule.renderable)
    }

    return true
  }

  /**
   * Get index of a rule.
   */
  indexOf(rule: Rule): number {
    return this.rules.indexOf(rule)
  }

  /**
   * Convert rules to a CSS string.
   */
  toString(options?: toCssOptions): string {
    return this.rules.toString(options)
  }

  /**
   * Deploy pure CSS string to a renderable.
   */
  deploy(): StyleSheet {
    this.renderer.deploy(this)
    this.deployed = true
    return this
  }

  /**
   * Link renderable CSS rules with their corresponding models.
   */
  link(): StyleSheet {
    const cssRules = this.renderer.getRules()
    for (let i = 0; i < cssRules.length; i++) {
      const CSSStyleRule = cssRules[i]
      const rule = this.rules.get(CSSStyleRule.selectorText)
      if (rule) rule.renderable = CSSStyleRule
    }
    this.linked = true
    return this
  }
}

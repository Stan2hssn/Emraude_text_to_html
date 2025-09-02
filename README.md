# Extract Text to HTML V1 (Figma Plugin)

## 📖 Description
**Extract Text to HTML** is a Figma plugin that converts your **TEXT** layers into **structured HTML**.  
It handles:
- **Bold text** (`<span class="bold">` or `<strong>`),
- **Paragraphs** (`<br>` or `<p>`),
- **Links** (new tab or same tab),
- **Lists** (via Figma `listOptions` or regex heuristics),
- **Font grouping** (automatic detection of Variable fonts).

---

## 🚀 Installation
1. Clone or copy this repo.
2. In Figma:  
    - `Plugins → Development → Import Plugin from Manifest...`  
    - Select the manifest:
      - `manifest.json`

3. Launch the plugin via:  
    - `Plugins → Development → Extract Text to HTML`

         or 
    
    - `cmd + p`

---

## 🛠️ Usage

### 1. Selection

Select one or more TEXT layers, or a Frame/Group containing them.

### 2. Options

Go to the OPTIONS tab and configure:

- **Font Weight**: `span.bold` or `strong`
- **Paragraphs**: `br` or `p`
- **Links**: `newtab` (opens in new tab) or `same` (same tab)
- **Lists**: `figma` (Figma styles) or `regex` (heuristic detection)

### 3. Extraction

Click **EXTRACT**.

Results are displayed in the EXTRACTOR tab, grouped by font family.

Each block has a copy button.

--- 

## 📋 Output Example

Options: `strong`, `p`, `newtab`, `figma`

```html
<p>Introduction to <strong>typography</strong>.</p>
<ul>
  <li>Main font <a href="https://example.com" target="_blank" rel="noopener">Azeret Mono</a></li>
  <li>Variable approach</li>
</ul>
<p>Conclusion.</p>
```

---

## Changelog

- **1.0.0**: Initial release

For any modifications, please push your changes to the GitHub/GitLab repository and update the README.md file accordingly.
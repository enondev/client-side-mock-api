#!/usr/bin/env python3
"""
generate_model.py — Scaffold a new self-contained model for the Mock OpenAI API registry.

Usage:
    python scripts/generate_model.py \
        --id coder \
        --name coder \
        --profile coder \
        --model openai/gpt-4o \
        --provider openai \
        --color "#6366f1" \
        --description "Senior coder persona — writes clean, tested, maintainable code." \
        --capabilities coding testing refactoring debugging \
        --is-system

Output:
    public/models/<id>/
        ├── index.html
        ├── app.js
        └── style.css

Also updates public/index.html MODEL_REGISTRY.
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path
from string import Template


ROOT = Path(__file__).parent.parent
TEMPLATES_DIR = Path(__file__).parent / "templates"
MODELS_DIR = ROOT / "public" / "models"
INDEX_HTML = ROOT / "public" / "index.html"


def parse_args():
    parser = argparse.ArgumentParser(description="Generate a new model scaffold")
    parser.add_argument("--id", required=True, help="Model ID (kebab-case, e.g., coder)")
    parser.add_argument("--name", required=True, help="Display name (e.g., coder)")
    parser.add_argument("--profile", required=True, help="Persona: architect, coder, researcher...")
    parser.add_argument("--model", required=True, help="Generating LLM (e.g., nvidia/nemotron-3-ultra)")
    parser.add_argument("--provider", default="nvidia", help="Provider name")
    parser.add_argument("--color", required=True, help="Hex accent color (e.g., #6366f1)")
    parser.add_argument("--description", required=True, help="One-line persona description")
    parser.add_argument("--capabilities", nargs="+", default=[], help="Capability tags")
    parser.add_argument("--is-system", action="store_true", help="System model (cannot be deleted)")
    return parser.parse_args()


def build_context(args):
    """Build template substitution context."""
    # Ensure color has alpha variants
    color = args.color.strip()
    if not color.startswith("#"):
        color = "#" + color
    # 13% and 27% opacity variants
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    color_dim = f"rgba({r}, {g}, {b}, 0.13)"
    color_glow = f"rgba({r}, {g}, {b}, 0.27)"
    color_strong = f"rgba({r}, {g}, {b}, 0.9)"

    is_system = args.is_system
    badge_class = "badge-system" if is_system else "badge-custom"
    badge_text = "System Model" if is_system else "Custom Model"
    id_short = args.id[:5]
    capabilities_json = json.dumps(args.capabilities)

    # Badge configuration for the profile/type (used in root dashboard)
    # These map to CSS classes: badge-architect, badge-coder, badge-researcher, etc.
    profile_badge_class = f"badge-{args.profile}"
    profile_badge_label = args.profile.capitalize()

    return {
        "id": args.id,
        "name": args.name,
        "profile": args.profile,
        "model": args.model,
        "provider": args.provider,
        "color": color,
        "color_dim": color_dim,
        "color_glow": color_glow,
        "color_strong": color_strong,
        "description": args.description,
        "capabilities": capabilities_json,
        "capabilities_list": args.capabilities,  # Keep raw list for registry
        "is_system": str(is_system).lower(),
        "badge_class": badge_class,
        "badge_text": badge_text,
        "profile_badge_class": profile_badge_class,
        "profile_badge_label": profile_badge_label,
        "id_short": id_short,
        "date": date.today().isoformat(),
        "avatar_initials": "".join(w[0] for w in args.name.split() if w).upper()[:2],
    }


def render_templates(context):
    """Render all three template files."""
    model_dir = MODELS_DIR / context["id"]
    model_dir.mkdir(parents=True, exist_ok=True)

    for template_name in ["app.js", "style.css", "index.html"]:
        template_path = TEMPLATES_DIR / f"{template_name}.tmpl"
        if not template_path.exists():
            raise FileNotFoundError(f"Missing template: {template_path}")

        template = Template(template_path.read_text(encoding="utf-8"))
        output = template.safe_substitute(context)
        (model_dir / template_name).write_text(output, encoding="utf-8")

    return model_dir


def update_registry(context):
    """Insert new model entry into MODEL_REGISTRY in public/index.html."""
    content = INDEX_HTML.read_text(encoding="utf-8")

    # Check if model already exists in registry
    if f'id: "{context["id"]}"' in content:
        print(f"Model '{context['id']}' already exists in registry, skipping registry update")
        # Still update badge mapping in case it's a new profile
        content = update_render_models_badges(content, context)
        INDEX_HTML.write_text(content, encoding="utf-8")
        return

    # Build the new registry entry
    tags_json = json.dumps(context['capabilities_list'])
    entry = f"""      {{
        id: "{context['id']}",
        name: "{context['name']}",
        description: "{context['description']}",
        type: "{context['profile']}",
        is_system: {context['is_system']},
        endpoints: ["/v1/models", "/v1/chat/endpoints", "/v1/models/{{model}}"],
        patterns: ["Rate Limiter", "Bulkhead", "Circuit Breaker"],
        tags: {tags_json},
        created: "{context['date']}",
        generated_by: {{
          model: "{context['model']}",
          provider: "{context['provider']}",
          date: "{context['date']}",
          profile: "{context['profile']}"
        }},
        badge: {{
          class: "{context['profile_badge_class']}",
          label: "{context['profile_badge_label']}"
        }}
      }},"""

    # Find MODEL_REGISTRY array and insert before the closing comment
    pattern = r"(const MODEL_REGISTRY = \[[\s\S]*?)(\s*// Future models added here)"
    match = re.search(pattern, content)
    if not match:
        raise ValueError("Could not find MODEL_REGISTRY in index.html")

    before = match.group(1)
    after = match.group(2)
    
    # Ensure the last entry in 'before' has a trailing comma
    # Find the last '},\n' or '}\n' before the comment and add comma if missing
    lines = before.split('\n')
    # Walk backwards to find the last entry closing brace
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if stripped == '}' or stripped == '},':
            if stripped == '}':
                lines[i] = lines[i].rstrip() + ','
            break
    before = '\n'.join(lines)
    
    new_content = content[:match.start(1)] + before + "\n" + entry + after + content[match.end(2):]

    # Also update the renderModels function to use dynamic badge mapping
    new_content = update_render_models_badges(new_content, context)

    INDEX_HTML.write_text(new_content, encoding="utf-8")


def _extract_badges_from_registry(content):
    """Extract (id, class, label) from MODEL_REGISTRY badge entries."""
    ids = re.findall(r'id:\s*"([^"]+)"', content)
    badges = re.findall(
        r'badge:\s*\{\s*class:\s*"([^"]*)"\s*,\s*label:\s*"([^"]*)"\s*\}',
        content,
    )
    entries = []
    for i, (cls, label) in enumerate(badges):
        key = ids[i] if i < len(ids) else f"model-{i}"
        entries.append((key, cls, label))
    return entries


def _render_badge_map(entries):
    lines = []
    for i, (key, cls, label) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append(f'      {key}: {{ class: "{cls}", label: "{label}" }}{comma}')
    return "\n".join(lines)


def update_render_models_badges(content, context):
    """Rebuild BADGE_MAP from MODEL_REGISTRY badge entries (single source of truth).

    This never does fragile line surgery on the JS object literal, so the
    emitted BADGE_MAP is always valid and stays consistent with the registry.
    """
    entries = _extract_badges_from_registry(content)
    if not entries:
        return content

    badge_map = (
        "// Badge mapping for model types — auto-updated by generate_model.py\n"
        "const BADGE_MAP = {\n"
        + _render_badge_map(entries)
        + "\n    };"
    )

    if "const BADGE_MAP" not in content:
        pattern = r"(    function renderModels\(\) \{)"
        replacement = badge_map + "\n\n    function renderModels() {"
        content = re.sub(pattern, replacement, content)
    else:
        content = re.sub(
            r"const BADGE_MAP = \{[\s\S]*?\n\s*\};",
            badge_map,
            content,
        )

    # Update the badge rendering in renderModels to use BADGE_MAP
    old_badge_render = r"\$\{model\.type === 'architect' \? '<span class=\"badge badge-architect\">Architect</span>' : ''\\}"
    new_badge_render = """${model.badge ? `<span class="badge ${model.badge.class}">${model.badge.label}</span>` : (BADGE_MAP[model.type] ? `<span class="badge ${BADGE_MAP[model.type].class}">${BADGE_MAP[model.type].label}</span>` : '')}"""
    content = re.sub(old_badge_render, new_badge_render, content)
    return content



def main():
    args = parse_args()
    context = build_context(args)
    model_dir = render_templates(context)
    update_registry(context)
    print(f"✅ Generated {model_dir.relative_to(ROOT)}/")
    print(f"   Updated MODEL_REGISTRY in public/index.html")


if __name__ == "__main__":
    main()
"""T108: Replace T97 search panel code with T108 full-page Kazumi-style search."""
import os

filepath = 'public/video/online.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '// ---------------------------------------------------------------- T97 搜索面板'
start_idx = content.find(start_marker)
end_search = content.find('function setActiveNav')
last_hot = content.rfind('    hotListEl.innerHTML = html;', start_idx, end_search)
block_end = content.find('\n  }\n\n  function setActiveNav', last_hot)

print(f'Start={start_idx} BlockEnd={block_end}')

if start_idx < 0 or block_end < 0:
    print('ERROR: Could not find markers!')
    exit(1)

old_block = content[start_idx:block_end + len('\n  }\n\n  ')]
print(f'Old block: {len(old_block)} chars, starts with: {repr(old_block[:60])}')

# Read new code from separate file
with open('scripts/t108_search_newcode.js', 'r', encoding='utf-8') as f:
    new_block = f.read()

content = content[:start_idx] + new_block + content[block_end + len('\n  }\n\n  '):]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done! {len(old_block)} -> {len(new_block)} chars. Total file: {len(content)} chars')

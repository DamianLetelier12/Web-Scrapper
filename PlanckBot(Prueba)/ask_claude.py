from model import train, filter_text, token_count

# entrenar
train()

# ejemplo real
raw = """node_modules/
src/
README.md
.env
package.json"""

filtered = filter_text(raw)

prompt = f"""Contexto del proyecto:
{filtered}

Pregunta: ¿Qué archivos son importantes para revisar primero?
"""

print("=== PROMPT PARA CLAUDE ===")
print(prompt)

print("\nTokens antes:", token_count(raw))
print("Tokens después:", token_count(filtered))
print("Ahorro:", round((1 - token_count(filtered)/token_count(raw))*100, 2), "%")
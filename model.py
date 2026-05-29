import json

noise_words = set()

def train():
    global noise_words

    with open("dataset.jsonl", "r") as f:
        data = [json.loads(line) for line in f]

    for item in data:
        input_lines = set(item["input"].split("\n"))
        output_lines = set(item["output"].split("\n"))

        removed = input_lines - output_lines
        noise_words.update(removed)

    print("Ruido aprendido:", noise_words)


def filter_text(text: str) -> str:
    lines = text.split("\n")
    filtered = [l for l in lines if l.strip() and l not in noise_words]
    return "\n".join(filtered)


def token_count(text: str) -> int:
    return len(text.split())
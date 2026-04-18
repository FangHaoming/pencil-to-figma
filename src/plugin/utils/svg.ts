export function convertSvgPathToFigma(pathData: string | undefined | null): string | null {
  if (!pathData || typeof pathData !== 'string') return null;

  try {
    const tokens = tokenizeSvgPath(pathData);
    if (!tokens || tokens.length === 0) return null;

    const pathSegments: string[] = [];
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    let i = 0;

    const fmt = (n: number) => Math.round(n * 1000000) / 1000000;

    while (i < tokens.length) {
      const token = tokens[i];

      if (typeof token === 'string') {
        const command = token;
        const isRelative = command === command.toLowerCase();
        const cmd = command.toUpperCase();

        i++;

        switch (cmd) {
          case 'M': {
            if (i >= tokens.length || typeof tokens[i] !== 'number') {
              console.warn('Invalid M command: missing x coordinate');
              break;
            }
            const x = Number(tokens[i++]) || 0;

            if (i >= tokens.length || typeof tokens[i] !== 'number') {
              console.warn('Invalid M command: missing y coordinate');
              break;
            }
            const y = Number(tokens[i++]) || 0;

            const absX = isRelative ? currentX + x : x;
            const absY = isRelative ? currentY + y : y;
            pathSegments.push(`M ${fmt(absX)} ${fmt(absY)}`);
            currentX = absX;
            currentY = absY;
            startX = absX;
            startY = absY;

            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length || typeof tokens[i + 1] !== 'number') {
                break;
              }
              const lx = Number(tokens[i++]) || 0;
              const ly = Number(tokens[i++]) || 0;
              const absLX = isRelative ? currentX + lx : lx;
              const absLY = isRelative ? currentY + ly : ly;
              pathSegments.push(`L ${fmt(absLX)} ${fmt(absLY)}`);
              currentX = absLX;
              currentY = absLY;
            }
            break;
          }

          case 'L': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length || typeof tokens[i + 1] !== 'number') {
                break;
              }
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;
              pathSegments.push(`L ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'H': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              const x = Number(tokens[i++]) || 0;
              const absX = isRelative ? currentX + x : x;
              pathSegments.push(`L ${fmt(absX)} ${fmt(currentY)}`);
              currentX = absX;
            }
            break;
          }

          case 'V': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              const y = Number(tokens[i++]) || 0;
              const absY = isRelative ? currentY + y : y;
              pathSegments.push(`L ${fmt(currentX)} ${fmt(absY)}`);
              currentY = absY;
            }
            break;
          }

          case 'C': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 5 >= tokens.length) {
                break;
              }
              const x1 = Number(tokens[i++]) || 0;
              const y1 = Number(tokens[i++]) || 0;
              const x2 = Number(tokens[i++]) || 0;
              const y2 = Number(tokens[i++]) || 0;
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;

              const absX1 = isRelative ? currentX + x1 : x1;
              const absY1 = isRelative ? currentY + y1 : y1;
              const absX2 = isRelative ? currentX + x2 : x2;
              const absY2 = isRelative ? currentY + y2 : y2;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`C ${fmt(absX1)} ${fmt(absY1)} ${fmt(absX2)} ${fmt(absY2)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'Q': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 3 >= tokens.length) {
                break;
              }
              const x1 = Number(tokens[i++]) || 0;
              const y1 = Number(tokens[i++]) || 0;
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;

              const absX1 = isRelative ? currentX + x1 : x1;
              const absY1 = isRelative ? currentY + y1 : y1;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`Q ${fmt(absX1)} ${fmt(absY1)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'S': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 3 >= tokens.length) {
                break;
              }
              const x2 = Number(tokens[i++]) || 0;
              const y2 = Number(tokens[i++]) || 0;
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;

              const absX2 = isRelative ? currentX + x2 : x2;
              const absY2 = isRelative ? currentY + y2 : y2;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`C ${fmt(currentX)} ${fmt(currentY)} ${fmt(absX2)} ${fmt(absY2)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'T': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length) {
                break;
              }
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;

              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;
              const ctrlX = (currentX + absX) / 2;
              const ctrlY = (currentY + absY) / 2;

              pathSegments.push(`Q ${fmt(ctrlX)} ${fmt(ctrlY)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'A': {
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 6 >= tokens.length) {
                break;
              }
              i += 5;
              const x = Number(tokens[i++]) || 0;
              const y = Number(tokens[i++]) || 0;

              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`L ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'Z': {
            pathSegments.push('Z');
            currentX = startX;
            currentY = startY;
            break;
          }

          default:
            console.warn('Unknown SVG path command:', command);
            break;
        }
      } else {
        i++;
      }
    }

    if (pathSegments.length === 0 || !pathSegments[0].startsWith('M')) {
      console.warn('Invalid path result:', pathSegments);
      return null;
    }

    return pathSegments.join(' ');
  } catch (error) {
    console.warn('Error converting SVG path:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function tokenizeSvgPath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  let i = 0;

  while (i < path.length) {
    const char = path[i];

    if (/[\s,]/.test(char)) {
      i++;
      continue;
    }

    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
      tokens.push(char);
      i++;
      continue;
    }

    let numStr = '';

    if (char === '-') {
      numStr += char;
      i++;
    }

    let hasDecimal = false;
    let hasExponent = false;

    while (i < path.length) {
      const c = path[i];

      if (/[0-9]/.test(c)) {
        numStr += c;
        i++;
      } else if (c === '.' && !hasDecimal && !hasExponent) {
        numStr += c;
        hasDecimal = true;
        i++;
      } else if (/[eE]/.test(c) && !hasExponent && numStr.length > 0) {
        numStr += c;
        hasExponent = true;
        i++;
        if (i < path.length && /[+-]/.test(path[i])) {
          numStr += path[i];
          i++;
        }
      } else {
        break;
      }
    }

    if (numStr.length > 0 && numStr !== '-') {
      tokens.push(Number.parseFloat(numStr));
    } else if (numStr === '-') {
      console.warn('Lone minus sign in path, skipping');
    }
  }

  return tokens;
}

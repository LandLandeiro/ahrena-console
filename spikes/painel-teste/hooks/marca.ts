// Gerado por packages/marca/src/gerar.ts a partir de docs/brand/tokens.json. Não edite: mude o tokens.json e rode `node packages/marca/src/gerar.ts`.

export const paleta = {
  "orange": {
    "100": "#fde3d1",
    "200": "#fac29b",
    "500": "#f47720",
    "700": "#ab5316",
    "900": "#612f0d"
  },
  "rose": {
    "500": "#df285d",
    "700": "#b81f4b"
  },
  "yellow": {
    "100": "#fff3ce",
    "200": "#ffe490",
    "500": "#ffc30a",
    "700": "#b28807",
    "900": "#664e04"
  },
  "red": {
    "300": "#f06463",
    "500": "#e34948",
    "700": "#b42a2a"
  },
  "gray": {
    "100": "#d7d7d9",
    "200": "#a6a6aa",
    "300": "#5a5a63",
    "500": "#3a3a44",
    "700": "#28282f",
    "800": "#1e1e24",
    "900": "#17171b"
  },
  "mono": {
    "white": "#fdfdfd",
    "black": "#0e1016"
  }
} as const

export const ci = {
  "success": "#d7d7d9",
  "failure": "#e34948",
  "pending": "#ffc30a"
} as const

export const temas = {
  "dark": {
    "bg": "#17171b",
    "surface": "#1e1e24",
    "raised": "#28282f",
    "border": "#2e2e36",
    "text": "#f2f2f3",
    "muted": "#c4c4c8",
    "accent": "#f47720",
    "onAccent": "#17171b",
    "accentText": "#f47720",
    "rose": "#df285d",
    "subtle": "#9a9aa0",
    "sidebar": "#1b1b20",
    "segment": "#26262c",
    "track": "#33333b",
    "avatar": "#2e2e36",
    "primary": "#e4e4e7",
    "onPrimary": "#17171b",
    "accentLine": "#f47720",
    "borderControl": "#72727c"
  },
  "light": {
    "bg": "#f4f4f5",
    "surface": "#fdfdfd",
    "raised": "#efeff1",
    "border": "#e3e3e6",
    "text": "#17171b",
    "muted": "#4a4a52",
    "accent": "#f47720",
    "onAccent": "#17171b",
    "accentText": "#ab5316",
    "rose": "#df285d",
    "subtle": "#64646c",
    "sidebar": "#ececef",
    "segment": "#e6e6e9",
    "track": "#e6e6e9",
    "avatar": "#ececef",
    "primary": "#17171b",
    "onPrimary": "#fdfdfd",
    "accentLine": "#ab5316",
    "borderControl": "#83838b"
  }
} as const

export const ordemStatus = [
  "active",
  "waiting",
  "completed",
  "error",
  "abandoned"
] as const

export const status = {
  "active": {
    "label": "Trabalhando",
    "glyph": "●",
    "color": "#f47720",
    "dark": {
      "dot": "#f47720",
      "text": "#f47720",
      "badge": "#382924",
      "border": "#55392a"
    },
    "light": {
      "dot": "#ab5316",
      "text": "#ab5316",
      "badge": "#fcede2",
      "border": "#f4d3bb"
    }
  },
  "waiting": {
    "label": "Esperando você",
    "glyph": "◐",
    "color": "#ffc30a",
    "motivos": {
      "notification": {
        "label": "Pede permissão",
        "urgente": true
      },
      "interrupted": {
        "label": "Interrompida",
        "urgente": true
      },
      "stop": {
        "label": "Sua vez",
        "urgente": false
      },
      "session_start": {
        "label": "No prompt",
        "urgente": false
      }
    },
    "dark": {
      "dot": "#ffc30a",
      "text": "#ffc30a",
      "badge": "#393221",
      "border": "#4f4426"
    },
    "light": {
      "dot": "#a87e00",
      "text": "#664e04",
      "badge": "#fdf6e0",
      "border": "#f1e2b0"
    }
  },
  "completed": {
    "label": "Concluída",
    "glyph": "✓",
    "color": "#d7d7d9",
    "dark": {
      "dot": "#d7d7d9",
      "text": "#d7d7d9",
      "badge": "#34343a"
    },
    "light": {
      "dot": "#3a3a44",
      "text": "#3a3a44",
      "badge": "#f8f8f9"
    }
  },
  "error": {
    "label": "Com erro",
    "glyph": "✕",
    "color": "#e34948",
    "dark": {
      "dot": "#e34948",
      "text": "#f06463",
      "badge": "#362328"
    },
    "light": {
      "dot": "#b42a2a",
      "text": "#b42a2a",
      "badge": "#fae7e7"
    }
  },
  "abandoned": {
    "label": "Abandonada",
    "glyph": "○",
    "color": "#a6a6aa",
    "dark": {
      "dot": "#a6a6aa",
      "text": "#a6a6aa",
      "badge": "#2e2e34"
    },
    "light": {
      "dot": "#5a5a63",
      "text": "#5a5a63",
      "badge": "#f3f3f3"
    }
  }
} as const

export const tipografia = {
  "sans": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Inter, system-ui, sans-serif",
  "mono": "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
  "size": {
    "xs": "12px",
    "sm": "13px",
    "md": "14px",
    "lg": "16px",
    "xl": "20px",
    "xxl": "28px",
    "title": "30px",
    "hero": "64px"
  },
  "weight": {
    "regular": 400,
    "medium": 500,
    "semibold": 600
  },
  "tracking": {
    "title": "-0.02em"
  },
  "usos": {
    "sans": "títulos, rótulos e texto corrido no artefato",
    "mono": "ids, caminhos, números de tabela, custo e tokens; e tudo no painel nativo",
    "title": "título de tela, peso 600 e --tracking-title",
    "hero": "o número herói, peso 500, com dígitos tabulares (font-variant-numeric: tabular-nums) e sem ajuste de espaçamento"
  }
} as const

export const spacing = {
  "xxs": "2px",
  "xs": "4px",
  "sm": "6px",
  "md": "8px",
  "lg": "12px",
  "xl": "16px",
  "xxl": "24px"
} as const

export const agent = {
  "violet": {
    "dark": {
      "text": "#c4b2f5",
      "bg": "#2d2640"
    },
    "light": {
      "text": "#5b3fa8",
      "bg": "#efe9fb"
    }
  },
  "blue": {
    "dark": {
      "text": "#9cc1f5",
      "bg": "#1f2a3d"
    },
    "light": {
      "text": "#2456a6",
      "bg": "#e6eefb"
    }
  },
  "teal": {
    "dark": {
      "text": "#84d3c8",
      "bg": "#1c3331"
    },
    "light": {
      "text": "#11695f",
      "bg": "#e2f3f1"
    }
  },
  "indigo": {
    "dark": {
      "text": "#aeb6f0",
      "bg": "#262a42"
    },
    "light": {
      "text": "#3b4594",
      "bg": "#e8eaf8"
    }
  }
} as const

export const radius = {
  "card": "8px",
  "control": "6px",
  "tag": "4px",
  "segment": "8px",
  "segmentItem": "6px",
  "full": "999px"
} as const

export const shadow = {
  "dark": {
    "float": "0 12px 32px rgba(0,0,0,0.5)"
  },
  "light": {
    "float": "0 12px 32px rgba(0,0,0,0.14)"
  }
} as const

export const motion = {
  "fast": "120ms",
  "base": "180ms",
  "move": "220ms",
  "easeOut": "cubic-bezier(0.2, 0, 0, 1)",
  "easeIn": "cubic-bezier(0.4, 0, 1, 1)"
} as const

export type Tema = keyof typeof temas
export type StatusId = (typeof ordemStatus)[number]

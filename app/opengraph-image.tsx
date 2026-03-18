import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'GitPacks — Collect the Contributors Behind the Code';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const orbitronFont = fetch(
  new URL('../public/Orbitron.ttf', import.meta.url)
).then((res) => res.arrayBuffer());

const rajdhaniFont = fetch(
  new URL('../public/Rajdhani-Bold.ttf', import.meta.url)
).then((res) => res.arrayBuffer());

export default async function Image() {
  const [orbitronData, rajdhaniData] = await Promise.all([orbitronFont, rajdhaniFont]);

  const rarities = [
    { label: 'COMMON', color: '#888888', border: 'rgba(136,136,136,0.5)' },
    { label: 'RARE', color: '#60a5fa', border: 'rgba(59,130,246,0.5)' },
    { label: 'EPIC', color: '#c084fc', border: 'rgba(168,85,247,0.5)' },
    { label: 'LEGENDARY', color: '#ffd700', border: 'rgba(255,215,0,0.5)' },
    { label: 'MYTHIC', color: '#ff0040', border: 'rgba(255,0,64,0.6)' },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f2a 50%, #0a0a1a 100%)',
          position: 'relative',
        }}
      >
        {/* Subtle glow effects */}
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            background: 'radial-gradient(ellipse at 30% 40%, rgba(120,115,245,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(74,222,222,0.08) 0%, transparent 60%)',
          }}
        />

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <div
            style={{
              fontFamily: 'Orbitron',
              fontSize: '72px',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #ff6ec7, #7873f5, #4adede)',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '4px',
              display: 'flex',
            }}
          >
            GITPACKS
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: 'Rajdhani',
            fontSize: '32px',
            color: '#888888',
            letterSpacing: '2px',
            marginBottom: '48px',
            display: 'flex',
          }}
        >
          Collect the contributors behind the code
        </div>

        {/* Rarity cards row */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {rarities.map((r) => (
            <div
              key={r.label}
              style={{
                width: '140px',
                height: '180px',
                borderRadius: '16px',
                border: `2px solid ${r.border}`,
                background: 'rgba(20,20,40,0.8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  border: `2px solid ${r.border}`,
                  background: `radial-gradient(circle, ${r.border} 0%, transparent 70%)`,
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontFamily: 'Orbitron',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: r.color,
                  letterSpacing: '2px',
                  display: 'flex',
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  width: '60%',
                  height: '4px',
                  borderRadius: '2px',
                  background: r.border,
                  display: 'flex',
                }}
              />
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            fontFamily: 'Orbitron',
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '4px',
            color: '#4adede',
            opacity: 0.5,
            display: 'flex',
          }}
        >
          GITPACKS.COM
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Orbitron',
          data: orbitronData,
          style: 'normal' as const,
          weight: 700 as const,
        },
        {
          name: 'Rajdhani',
          data: rajdhaniData,
          style: 'normal' as const,
          weight: 700 as const,
        },
      ],
    }
  );
}

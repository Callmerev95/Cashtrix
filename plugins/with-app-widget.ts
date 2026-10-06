/**
 * Home-screen widget (WG2, ADR-0011; card restyle follow-up) — Android only
 * in this batch (iOS widget deferred: owner runs Android, no Apple Team ID
 * on file).
 *
 * Build-time config plugin, zero runtime dependency (same pattern as
 * `with-app-shortcuts`): a header (app icon + name + WIDGET badge, no
 * figures — glanceable numbers stay out of scope until the privacy/refresh
 * design lands) plus three tappable cards (Voice / Tambah Transaksi /
 * Pindai Struk, middle card gold-highlighted). Each card fires a plain
 * `VIEW` intent at a deep link the app already owns, plus `source=widget`
 * so the form arms the widget save path (local notification + dismiss).
 * The widget holds no data, no session, no query — `updatePeriodMillis` is
 * 0 and there is deliberately no `configure` activity or refresh logic.
 *
 * Colours follow `design.md` (`#0A0A0A` canvas, `#1C1C1E` cards, `#D4AF37`
 * gold, `#E5E5E5` text, `#8E8E93` secondary) — the Stitch mock is a layout
 * reference only, never a hex source.
 *
 * Like the shortcuts plugin, this takes effect on the next preview rebuild
 * (lesson D4/B4), never via OTA.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from 'expo/config-plugins';

const WIDGET_INFO_XML = 'cashtrix_widget_info';
const WIDGET_LAYOUT_XML = 'cashtrix_widget';
const WIDGET_STRINGS_XML = 'cashtrix_widget_strings';

/* eslint-disable no-restricted-syntax --
   Native widget resources cannot import from `@/theme` (PRD §4.5 targets
   React components); these values mirror the theme tokens by hand. */
const WIDGET_COLORS = {
  canvas: '#0A0A0A',
  card: '#1C1C1E',
  gold: '#D4AF37',
  text: '#E5E5E5',
  textSecondary: '#8E8E93',
  onGold: '#0A0A0A',
  goldShade: '#4A3F0B',
  /** Chevron disc on dark cards (mirrors `surfaceElevated`). */
  chev: '#2C2C2E',
} as const;
/* eslint-enable no-restricted-syntax */

type WidgetButton = {
  viewId: string;
  labelKey: string;
  label: string;
  subKey: string;
  /** Second line under the label (owner-approved wording, no "AI"). */
  sub: string;
  /** Framework drawable rendered as the card icon. */
  icon: string;
  /** The middle card renders gold-highlighted (dark icon + text). */
  gold: boolean;
  description: string;
  uri: string;
};

const BUTTONS: WidgetButton[] = [
  {
    viewId: 'widget_card_voice',
    labelKey: 'widget_voice',
    label: 'Catat Suara',
    subKey: 'widget_voice_sub',
    sub: 'Voice',
    icon: 'ic_btn_speak_now',
    gold: false,
    description: 'Catat dengan suara',
    uri: 'cashtrix://voice?source=widget',
  },
  {
    viewId: 'widget_card_add',
    labelKey: 'widget_add',
    label: 'Tambah Transaksi',
    subKey: 'widget_add_sub',
    sub: 'Keypad',
    icon: 'ic_menu_add',
    gold: true,
    description: 'Tambah transaksi',
    uri: 'cashtrix://add-transaction?source=widget',
  },
  {
    viewId: 'widget_card_scan',
    labelKey: 'widget_scan',
    label: 'Pindai Struk',
    subKey: 'widget_scan_sub',
    sub: 'Auto OCR',
    icon: 'ic_menu_camera',
    gold: false,
    description: 'Pindai struk',
    uri: 'cashtrix://scan?source=widget',
  },
];

function widgetInfoXml(): string {
  // Device finding (Redmi/HyperOS): `minWidth/minHeight` alone do not stop
  // the launcher from placing the widget one row tall with the cards cut
  // off. `targetCellWidth/Height` (API 31+) tells it the intended 4x2
  // footprint up front, and `resizeMode` + min-resize bounds let the user
  // fix a squeezed placement by hand instead of re-adding the widget.
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="200dp"
  android:minResizeWidth="180dp"
  android:minResizeHeight="110dp"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:resizeMode="horizontal|vertical"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/${WIDGET_LAYOUT_XML}"
  android:description="@string/widget_desc"
  android:widgetCategory="home_screen" />
`;
}

function widgetCardXml(button: WidgetButton): string {
  const cardBg = button.gold
    ? '@drawable/cashtrix_widget_card_gold'
    : '@drawable/cashtrix_widget_card';
  const accent = button.gold ? WIDGET_COLORS.onGold : WIDGET_COLORS.gold;
  const titleColor = button.gold ? WIDGET_COLORS.onGold : WIDGET_COLORS.text;
  const subColor = button.gold
    ? WIDGET_COLORS.goldShade
    : WIDGET_COLORS.textSecondary;
  // 2.1.0 polish (XML-only, reference `stitch_cashtrix/widget-polish.png`):
  // icon ring + top-end chevron + a taller gold middle card. Waveform /
  // watermark / receipt artwork stays out — RemoteViews cannot blur or draw
  // it, so that is a bitmap-asset ticket (LW), not this rebuild.
  const chevBg = button.gold
    ? '@drawable/cashtrix_widget_chev_gold'
    : '@drawable/cashtrix_widget_chev';
  const height = button.gold ? '144dp' : '132dp';
  return `  <FrameLayout
    android:id="@+id/${button.viewId}"
    android:layout_width="0dp"
    android:layout_height="${height}"
    android:layout_weight="1"
    android:layout_margin="4dp"
    android:padding="8dp"
    android:background="${cardBg}"
    android:contentDescription="${button.description}">
    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="match_parent"
      android:orientation="vertical"
      android:gravity="center">
      <FrameLayout
        android:layout_width="40dp"
        android:layout_height="40dp"
        android:background="@drawable/cashtrix_widget_ring">
        <ImageView
          android:layout_width="28dp"
          android:layout_height="28dp"
          android:layout_gravity="center"
          android:src="@android:drawable/${button.icon}"
          android:tint="${accent}"
          android:contentDescription="${button.description}" />
      </FrameLayout>
      <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:text="@string/${button.labelKey}"
        android:textColor="${titleColor}"
        android:textSize="12sp"
        android:textStyle="bold"
        android:gravity="center"
        android:maxLines="2" />
      <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:text="@string/${button.subKey}"
        android:textColor="${subColor}"
        android:textSize="10sp"
        android:gravity="center" />
    </LinearLayout>
    <TextView
      android:layout_width="20dp"
      android:layout_height="20dp"
      android:layout_gravity="top|end"
      android:layout_margin="6dp"
      android:gravity="center"
      android:text="›"
      android:textColor="${WIDGET_COLORS.gold}"
      android:textSize="14sp"
      android:textStyle="bold"
      android:background="${chevBg}" />
  </FrameLayout>`;
}

function widgetLayoutXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="wrap_content"
  android:orientation="vertical"
  android:padding="10dp"
  android:background="@drawable/cashtrix_widget_bg">
  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingBottom="8dp">
    <FrameLayout
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:background="@drawable/cashtrix_widget_ring">
      <ImageView
        android:layout_width="32dp"
        android:layout_height="32dp"
        android:layout_gravity="center"
        android:src="@mipmap/ic_launcher"
        android:contentDescription="@string/app_name" />
    </FrameLayout>
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="8dp"
      android:text="@string/app_name"
      android:textColor="${WIDGET_COLORS.text}"
      android:textSize="16sp"
      android:textStyle="bold" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="8dp"
      android:text="WIDGET"
      android:textColor="${WIDGET_COLORS.gold}"
      android:textSize="11sp"
      android:textStyle="bold"
      android:paddingStart="8dp"
      android:paddingEnd="8dp"
      android:paddingTop="3dp"
      android:paddingBottom="3dp"
      android:background="@drawable/cashtrix_widget_pill" />
  </LinearLayout>
  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center">
${BUTTONS.map((button) => widgetCardXml(button)).join('\n')}
  </LinearLayout>
</LinearLayout>
`;
}

function widgetDrawableXml(color: string, radius: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="rectangle">
  <solid android:color="${color}" />
  <corners android:radius="${radius}" />
</shape>
`;
}

function widgetPillXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="rectangle">
  <stroke android:width="1dp" android:color="${WIDGET_COLORS.gold}" />
  <corners android:radius="12dp" />
</shape>
`;
}

/** 2.1.0 polish: gold icon ring (oval stroke, transparent fill). */
function widgetRingXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="oval">
  <stroke android:width="1dp" android:color="${WIDGET_COLORS.gold}" />
</shape>
`;
}

/** 2.1.0 polish: chevron disc (solid oval, no stroke). */
function widgetChevXml(color: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="oval">
  <solid android:color="${color}" />
</shape>
`;
}

function widgetStringsXml(): string {
  const entries = BUTTONS.map(
    (button) =>
      `  <string name="${button.labelKey}">${button.label}</string>\n  <string name="${button.subKey}">${button.sub}</string>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries}\n  <string name="widget_desc">Pintasan catat Cashtrix</string>\n</resources>\n`;
}

function widgetProviderJava(packageName: string): string {
  const bindings = BUTTONS.map(
    (button) =>
      `    bindButton(context, views, R.id.${button.viewId}, "${button.uri}");`,
  ).join('\n');
  return `package ${packageName};

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Generated by the WG2 config plugin — buttons only, no data, no session. */
public class CashtrixWidgetProvider extends AppWidgetProvider {
  static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.${WIDGET_LAYOUT_XML});
${bindings}
    manager.updateAppWidget(widgetId, views);
  }

  static void bindButton(Context context, RemoteViews views, int viewId, String uri) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
    intent.setPackage(context.getPackageName());
    PendingIntent pending = PendingIntent.getActivity(
      context, viewId, intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(viewId, pending);
  }

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
    for (int widgetId : widgetIds) {
      updateWidget(context, manager, widgetId);
    }
  }
}
`;
}

const withCashtrixAppWidget: ConfigPlugin = (config) => {
  const packageName =
    config.android?.package ?? 'com.callmerev95.cashtrix';

  config = withAndroidManifest(config, (config) => {
    // `receiver` is absent from the manifest activity/application types, so
    // the provider entry is handled through a narrow structural view (same
    // trick as the launcher `meta-data` in `with-app-shortcuts`).
    type ManifestReceiver = {
      $?: { [key: string]: string };
      'intent-filter'?: {
        action?: { $?: { [key: string]: string } }[];
      }[];
      'meta-data'?: {
        $?: { [key: string]: string };
      }[];
    };
    type ManifestApplication = {
      receiver?: ManifestReceiver[];
    };
    const application = config.modResults.manifest.application?.[0] as unknown as
      | ManifestApplication
      | undefined;
    if (application) {
      if (!application.receiver) application.receiver = [];
      const exists = application.receiver.some(
        (item) =>
          item.$?.['android:name'] === '.CashtrixWidgetProvider',
      );
      if (!exists) {
        application.receiver.push({
          $: {
            'android:name': '.CashtrixWidgetProvider',
            'android:exported': 'false',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name':
                      'android.appwidget.action.APPWIDGET_UPDATE',
                  },
                },
              ],
            },
          ],
          'meta-data': [
            {
              $: {
                'android:name': 'android.appwidget.provider',
                'android:resource': `@xml/${WIDGET_INFO_XML}`,
              },
            },
          ],
        });
      }
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res',
      );
      const xmlDir = join(resDir, 'xml');
      const layoutDir = join(resDir, 'layout');
      const valuesDir = join(resDir, 'values');
      const drawableDir = join(resDir, 'drawable');
      mkdirSync(xmlDir, { recursive: true });
      mkdirSync(layoutDir, { recursive: true });
      mkdirSync(valuesDir, { recursive: true });
      mkdirSync(drawableDir, { recursive: true });
      writeFileSync(
        join(xmlDir, `${WIDGET_INFO_XML}.xml`),
        widgetInfoXml(),
      );
      writeFileSync(
        join(layoutDir, `${WIDGET_LAYOUT_XML}.xml`),
        widgetLayoutXml(),
      );
      writeFileSync(
        join(valuesDir, `${WIDGET_STRINGS_XML}.xml`),
        widgetStringsXml(),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_bg.xml'),
        widgetDrawableXml(WIDGET_COLORS.canvas, '28dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_card.xml'),
        widgetDrawableXml(WIDGET_COLORS.card, '20dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_card_gold.xml'),
        widgetDrawableXml(WIDGET_COLORS.gold, '20dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_pill.xml'),
        widgetPillXml(),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_ring.xml'),
        widgetRingXml(),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_chev.xml'),
        widgetChevXml(WIDGET_COLORS.chev),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_chev_gold.xml'),
        widgetChevXml(WIDGET_COLORS.onGold),
      );
      const javaDir = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.'),
      );
      mkdirSync(javaDir, { recursive: true });
      writeFileSync(
        join(javaDir, 'CashtrixWidgetProvider.java'),
        widgetProviderJava(packageName),
      );
      return config;
    },
  ]);

  return config;
};

export default withCashtrixAppWidget;

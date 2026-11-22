# TrussLab Architect — исходники и релизы

Браузерный 3D-конструктор моста, географического мира и городской симуляции. **Основная ветка содержит исходники, тесты и сборщик.** Готовые автономные HTML/ZIP хранятся в [GitHub Releases](https://github.com/OldFikus/TrussLab-Architect/releases).

## Опубликованные версии и фактическое наполнение

| GitHub Release | Что фактически выпущено | Из какой серии первоначального плана |
|---|---|---|
| [13.0](https://github.com/OldFikus/TrussLab-Architect/releases/tag/v13.0.0) | RenderCore 2, обновлённые материалы, свет и рендеринг | **12.1–12.9** |
| [14.0](https://github.com/OldFikus/TrussLab-Architect/releases/tag/v14.0.0) | WorldEditor 2: участки, дороги, здания, рельеф, GIS | **13.1–13.9** |
| [15.0](https://github.com/OldFikus/TrussLab-Architect/releases/tag/v15.0.0) | InfrastructureSim: транспортные графы, инфраструктура и учебные нагрузки | **14.1–14.9** |

**Важно:** число на релизе — исторический номер опубликованного пакета; номера исходных этапов в плане не надо считать фактически совпадающими с версией архива. CitySim 15.1–15.9 и WorldStream 15.10 пока распространялись как отдельные проверочные сборки, **не являются частью GitHub Release 15.0**.

## GPU Clarity и WorldForge

[Сборки SAFE/LAB, архивы и отчёты тестов](https://github.com/OldFikus/TrussLab-Architect/releases). Откройте SAFE.html, выберите «Атлас» и учебный регион. Дополнительные данные можно загрузить из локальной папки. Руководство открывается по F1.

Сводный ReleaseCandidate 19.0 включает восстановление, профилирование и регрессии 19.1–19.9. [Состав WorldForge 20.0](docs/WORLDFORGE_RU.md).

## Региональные пакеты и достоверность

PlanetStream 17.0 объединяет работу 17.1–17.9: офлайн-пакеты, глобальный атлас, локальные системы координат, потоковый показ геометрии и изображений. [Формат, учебный регион и порядок импорта](docs/PLANETSTREAM_RU.md).

FidelityLab 18.0 объединяет пункты 18.1–18.9. [Модели, источники, сверка и исправления](docs/FIDELITYLAB_RU.md).

## Ресурсы

- [**Неприкосновенная оригинальная дорожная карта 10.8–20.0**](ROADMAP_10_8_TO_20_0_RU.md) — полный план, включая **16.0 NatureWorld**.
- [**Каталог релизов: единый формат версий**](docs/RELEASE_CATALOG_RU.md).
- [Исходники и ограничения 13.0](docs/RELEASE_13_RU.md), [14.0](docs/RELEASE_14_RU.md), [15.0](docs/RELEASE_15_RU.md).
- [Статус NatureWorld 16.0–16.9](docs/NATUREWORLD_16_STATUS_RU.md).

## Сборка текущего релиза из исходников

```bash
python tools/build.py
node tests/test_worldeditor_core.cjs
node tests/test_infrastructure.cjs
node tests/test_infrastructure_stress.cjs
```

Для готового приложения используйте HTML в Releases. Географические оси реального Крымского моста, конструктивные нагрузки, батиметрия и инженерная безопасность **не подтверждены**. Модели симуляции в доступных сборках игровые и не заменяют расчёт инженера.

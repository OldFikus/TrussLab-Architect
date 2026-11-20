# TrussLab Architect 15.0 — InfrastructureSim

**Рабочая автономная HTML-версия** на базе опубликованного [TrussLab 15.0 InfrastructureSim](https://github.com/OldFikus/TrussLab-Architect/releases/tag/v14.0.0).

Используй кнопку **«🚦 InfrastructureSim»** на главной панели или внутри WorldEditor. В новом окне доступны сеть дорог и Ж/Д, динамический транспорт, диспетчер поездов, суда, схематические расчёты мостового пролёта и фундаментов, погода, снимки и сравнение сценариев. Кнопка «＋ Демо-сеть» позволяет начать без внешних файлов. «▦ WorldEditor» возвращает к редактированию географической карты.

### Сборка

```bash
python tools/build.py
node tests/test_infrastructure.cjs
node tests/test_infrastructure_stress.cjs
node tests/test_worldeditor_core.cjs
node tests/test_wgs84_alignment.cjs
```

Для браузерных проверок нужно установить Playwright/Chromium: `python tests/test_infrastructure_browser.py` (на Windows путь к Chromium в скрипте нужно заменить на свой).

[Ведомость функций и ограничений](docs/INFRASTRUCTURE_STATUS_14_1_TO_14_9_RU.md).

> Важное предупреждение: это **учебная/игровая** симуляция. Данные берегов и рельефа могут быть реальными, но инженерная ось мостового перехода, геотехника, навигационные габариты и фактическая несущая способность реального Крымского моста в исходниках не подтверждены. Никакой расчёт «безопасен» или «устойчив» здесь не является заключением инженера.

Готовые HTML и ZIP для проверки доступны в чате. **Исходники InfrastructureSim 15.0 опубликованы в GitHub, готовый HTML и ZIP доступны в Releases** — последнее опубликованное крупное обновление остаётся 14.0.

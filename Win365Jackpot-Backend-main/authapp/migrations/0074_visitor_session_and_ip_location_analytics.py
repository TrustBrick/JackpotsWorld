"""
VISITOR-ANALYTICS: Visitor + VisitorSession, and the columns that let an event
carry who/where/what-was-clicked.

Purely additive — no column is dropped, renamed or retyped, so every existing
AnalyticsEvent row stays valid and every existing dashboard query keeps
working. New rows on old events are blank/NULL, which the read side already
treats as "unresolved" rather than fabricating a value.

Backfill is deliberately NOT attempted. The visitor/session/location of a past
event cannot be recovered — the IP was never stored, and inventing a location
for historical rows is exactly what §27 forbids. Old events therefore report
"Unknown" for location, and the visitor list starts from the first request
after this migration is applied.
"""

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0073_video_click_and_location_analytics'),
    ]

    operations = [
        migrations.AddField(
            model_name='analyticsevent',
            name='country_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='destination_url',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='element_id',
            field=models.CharField(blank=True, db_index=True, max_length=120),
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='element_label',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='element_type',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AlterField(
            model_name='analyticsevent',
            name='event_type',
            field=models.CharField(choices=[('page_view', 'Page View'), ('url_click', 'URL Click'), ('click', 'Click'), ('video_impression', 'Video Impression'), ('video_start', 'Video Start'), ('video_progress', 'Video Progress'), ('video_complete', 'Video Complete'), ('video_pause', 'Video Pause'), ('video_exit', 'Video Exit'), ('video_click', 'Video Click'), ('video_cta_click', 'Video CTA Click'), ('signup', 'Signup'), ('login', 'Login')], db_index=True, max_length=32),
        ),
        migrations.CreateModel(
            name='Visitor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('country_code', models.CharField(blank=True, db_index=True, max_length=2)),
                ('country_name', models.CharField(blank=True, max_length=100)),
                ('region', models.CharField(blank=True, max_length=100)),
                ('region_code', models.CharField(blank=True, max_length=10)),
                ('city', models.CharField(blank=True, max_length=100)),
                ('timezone_name', models.CharField(blank=True, max_length=64)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('isp', models.CharField(blank=True, max_length=120)),
                ('geo_status', models.CharField(blank=True, choices=[('success', 'Success'), ('failed', 'Failed'), ('private_ip', 'Private / local IP'), ('unavailable', 'Unavailable')], db_index=True, max_length=16)),
                ('visitor_id', models.CharField(db_index=True, max_length=64, unique=True)),
                ('first_seen', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('last_seen', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('device_type', models.CharField(blank=True, max_length=20)),
                ('browser', models.CharField(blank=True, max_length=40)),
                ('operating_system', models.CharField(blank=True, max_length=40)),
                ('first_referrer', models.CharField(blank=True, max_length=500)),
                ('landing_page', models.CharField(blank=True, max_length=500)),
                ('traffic_source', models.CharField(blank=True, db_index=True, max_length=60)),
                ('utm_source', models.CharField(blank=True, max_length=100)),
                ('utm_medium', models.CharField(blank=True, max_length=100)),
                ('utm_campaign', models.CharField(blank=True, max_length=150)),
                ('utm_content', models.CharField(blank=True, max_length=150)),
                ('utm_term', models.CharField(blank=True, max_length=150)),
            ],
            options={
                'ordering': ['-last_seen'],
                'indexes': [models.Index(fields=['-last_seen'], name='authapp_vis_last_se_8b7a87_idx'), models.Index(fields=['first_seen'], name='authapp_vis_first_s_1e1226_idx'), models.Index(fields=['country_code', 'last_seen'], name='authapp_vis_country_a6c5e9_idx')],
            },
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='visitor',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='events', to='authapp.visitor'),
        ),
        migrations.CreateModel(
            name='VisitorSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('country_code', models.CharField(blank=True, db_index=True, max_length=2)),
                ('country_name', models.CharField(blank=True, max_length=100)),
                ('region', models.CharField(blank=True, max_length=100)),
                ('region_code', models.CharField(blank=True, max_length=10)),
                ('city', models.CharField(blank=True, max_length=100)),
                ('timezone_name', models.CharField(blank=True, max_length=64)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('isp', models.CharField(blank=True, max_length=120)),
                ('geo_status', models.CharField(blank=True, choices=[('success', 'Success'), ('failed', 'Failed'), ('private_ip', 'Private / local IP'), ('unavailable', 'Unavailable')], db_index=True, max_length=16)),
                ('session_id', models.CharField(db_index=True, max_length=64, unique=True)),
                ('started_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('last_activity_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('device_type', models.CharField(blank=True, max_length=20)),
                ('browser', models.CharField(blank=True, max_length=40)),
                ('operating_system', models.CharField(blank=True, max_length=40)),
                ('referrer', models.CharField(blank=True, max_length=500)),
                ('landing_page', models.CharField(blank=True, max_length=500)),
                ('traffic_source', models.CharField(blank=True, db_index=True, max_length=60)),
                ('utm_source', models.CharField(blank=True, max_length=100)),
                ('utm_medium', models.CharField(blank=True, max_length=100)),
                ('utm_campaign', models.CharField(blank=True, max_length=150)),
                ('utm_content', models.CharField(blank=True, max_length=150)),
                ('utm_term', models.CharField(blank=True, max_length=150)),
                ('visitor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='authapp.visitor')),
            ],
            options={
                'ordering': ['-last_activity_at'],
            },
        ),
        migrations.AddField(
            model_name='analyticsevent',
            name='visitor_session',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='events', to='authapp.visitorsession'),
        ),
        migrations.AddIndex(
            model_name='analyticsevent',
            index=models.Index(fields=['visitor', 'created_at'], name='authapp_ana_visitor_4e843c_idx'),
        ),
        migrations.AddIndex(
            model_name='analyticsevent',
            index=models.Index(fields=['visitor_session', 'created_at'], name='authapp_ana_visitor_88e437_idx'),
        ),
        migrations.AddIndex(
            model_name='analyticsevent',
            index=models.Index(fields=['element_id', 'event_type'], name='authapp_ana_element_a8ee1b_idx'),
        ),
        migrations.AddIndex(
            model_name='visitorsession',
            index=models.Index(fields=['visitor', '-started_at'], name='authapp_vis_visitor_4a4ae4_idx'),
        ),
        migrations.AddIndex(
            model_name='visitorsession',
            index=models.Index(fields=['-last_activity_at'], name='authapp_vis_last_ac_58f29f_idx'),
        ),
        migrations.AddIndex(
            model_name='visitorsession',
            index=models.Index(fields=['country_code', 'started_at'], name='authapp_vis_country_51a571_idx'),
        ),
    ]

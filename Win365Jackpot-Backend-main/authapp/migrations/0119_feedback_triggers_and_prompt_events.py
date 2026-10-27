from django.db import migrations, models

TRIGGER_CHOICES = [
    ('manual', 'Opened by visitor'),
    ('experience_enquiry', 'After an experience enquiry'),
    ('whatsapp_enquiry', 'After the WhatsApp form'),
    ('registration', 'After a game or event registration'),
    ('signup', 'After signing up'),
    ('page_helpful', 'Was this page helpful?'),
    ('deposit', 'After a deposit request'),
    ('withdrawal', 'After a withdrawal request'),
    ('support_call', 'After a support call'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0118_visitor_feedback'),
    ]

    operations = [
        migrations.AlterField(
            model_name='visitorfeedback',
            name='trigger',
            field=models.CharField(choices=TRIGGER_CHOICES, db_index=True, default='manual', max_length=30),
        ),
        migrations.CreateModel(
            name='FeedbackPromptEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('trigger', models.CharField(choices=TRIGGER_CHOICES, db_index=True, max_length=30)),
                ('event', models.CharField(choices=[('shown', 'Popup shown'), ('dismissed', 'Popup closed without an answer')], db_index=True, max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]

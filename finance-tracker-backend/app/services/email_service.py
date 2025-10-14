from flask_mail import Message
from flask import current_app, render_template

def send_email(subject, recipients, body=None, html_template=None, **kwargs):
    try:
        mail = current_app.extensions.get("mail")
        if not mail:
            raise RuntimeError("Flask-Mail not initialized")

        msg = Message(subject, recipients=recipients)

        if body:
            msg.body = body
        if html_template:
            msg.html = render_template(html_template, **kwargs)

        mail.send(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

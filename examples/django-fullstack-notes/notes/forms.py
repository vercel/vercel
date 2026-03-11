from django import forms
from .models import Note


class NoteForm(forms.ModelForm):
    class Meta:
        model = Note
        fields = ['title', 'body']
        widgets = {
            'title': forms.TextInput(attrs={
                'placeholder': 'Note title',
                'autofocus': True,
            }),
            'body': forms.Textarea(attrs={
                'placeholder': 'Write your note here...',
                'rows': 8,
            }),
        }

# authapp/constants/ — shared vocabularies imported by models, services, views
# and serializers alike.
#
# Deliberately empty of re-exports: every consumer imports from the specific
# module (`from authapp.constants.games import GAME_CHOICES`), so this package
# never becomes an import cycle between models and the things that describe
# them.
